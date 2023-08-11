import express from 'express';
import { SocketHandler } from '../../utils/socket-handler';
import dockerode, { Container } from 'dockerode';
import { SeedContainerInfo, Emulator, SeedNetInfo } from '../../utils/seedemu-meta';
import { Sniffer } from '../../utils/sniffer';
import WebSocket from 'ws';
import { Controller } from '../../utils/controller';
import { memoryUsage } from 'process';

const router = express.Router();
const docker = new dockerode();
const socketHandler = new SocketHandler(docker);
const sniffer = new Sniffer(docker);
const controller = new Controller(docker);


const getContainers: () => Promise<SeedContainerInfo[]> = async function () {
    var containers: dockerode.ContainerInfo[] = await docker.listContainers();

    var _containers: SeedContainerInfo[] = await Promise.all(containers.map(async c => {
        var withMeta = c as SeedContainerInfo;
        
        //暂时不获取内存使用情况
        // var container = docker.getContainer(c.Id);
        // const chunk = await new Promise<any>((resolve, reject) => {
        //     container.stats({ stream: false }, (err, chunk) => {
        //         if (err) reject(err);
        //         else resolve(chunk);
        //     });
        // });
        // console.log(`memory usage = ${chunk.memory_stats.usage}, limit = ${chunk.memory_stats.limit},max_usage = ${chunk.memory_stats.max_usage}`);
        // console.log(chunk)
        // var memoryUsage = chunk.memory_stats.usage?chunk.memory_stats.usage:0;
        // var memoryLimit = chunk.memory_stats.limit?chunk.memory_stats.limit:0;
        // var memoryMax = chunk.memory_stats.max_usage?chunk.memory_stats.max_usage:0;
        
        withMeta.meta = {
            hasSession: socketHandler.getSessionManager().hasSession(c.Id),
            emulatorInfo: Emulator.ParseNodeMeta(c.Labels),    
            // memoryInfo: [memoryUsage, memoryMax,memoryLimit, ]
            memoryInfo: ['0','0','0']
        };
        

        // console.log(withMeta.meta.memoryInfo);
        return withMeta;
    }));

    // filter out undefine (not our nodes)
    return _containers.filter(c => c.meta.emulatorInfo.name);;
}

socketHandler.getLoggers().forEach(logger => logger.setSettings({
    minLevel: 'warn'
}));

sniffer.getLoggers().forEach(logger => logger.setSettings({
    minLevel: 'warn'
}));

controller.getLoggers().forEach(logger => logger.setSettings({
    minLevel: 'warn'
}));

router.get('/network', async function (req, res, next) {
    var networks = await docker.listNetworks();

    var _networks: SeedNetInfo[] = networks.map(n => {
        var withMeta = n as SeedNetInfo;

        withMeta.meta = {
            emulatorInfo: Emulator.ParseNetMeta(n.Labels)
        };

        return withMeta;
    });

    _networks = _networks.filter(n => n.meta.emulatorInfo.name);

    res.json({
        ok: true,
        result: _networks
    });

    next();
});

router.get('/container', async function (req, res, next) {
    try {
        let containers = await getContainers();

        res.json({
            ok: true,
            result: containers
        });
    } catch (e) {
        res.json({
            ok: false,
            result: e.toString()
        });
    }

    next();
});

router.get('/container/:id', async function (req, res, next) {
    var id = req.params.id;

    var candidates = (await docker.listContainers())
        .filter(c => c.Id.startsWith(id));

    if (candidates.length != 1) {
        res.json({
            ok: false,
            result: `no match or multiple match for container ID ${id}.`
        });
    } else {
        var result: any = candidates[0];
        result.meta = {
            hasSession: socketHandler.getSessionManager().hasSession(result.Id),
            emulatorInfo: Emulator.ParseNodeMeta(result.Labels)
        };
        res.json({
            ok: true, result
        });
    }

    next();
});

router.get('/container/:id/net', async function (req, res, next) {
    let id = req.params.id;

    var candidates = (await docker.listContainers())
        .filter(c => c.Id.startsWith(id));

    if (candidates.length != 1) {
        res.json({
            ok: false,
            result: `no match or multiple match for container ID ${id}.`
        });
        next();
        return;
    }

    let node = candidates[0];

    res.json({
        ok: true,
        result: await controller.isNetworkConnected(node.Id)
    });

    next();
});

router.post('/container/:id/net', express.json(), async function (req, res, next) {
    let id = req.params.id;

    var candidates = (await docker.listContainers())
        .filter(c => c.Id.startsWith(id));

    if (candidates.length != 1) {
        res.json({
            ok: false,
            result: `no match or multiple match for container ID ${id}.`
        });
        next();
        return;
    }

    let node = candidates[0];

    controller.setNetworkConnected(node.Id, req.body.status);

    res.json({
        ok: true
    });

    next();
});

router.ws('/console/:id', async function (ws, req, next) {
    try {
        await socketHandler.handleSession(ws, req.params.id);
    } catch (e) {
        if (ws.readyState == 1) {
            ws.send(`error creating session: ${e}\r\n`);
            ws.close();
        }
    }

    next();
});

var snifferSubscribers: WebSocket[] = [];
var currentSnifferFilter: string = '';

router.post('/sniff', express.json(), async function (req, res, next) {
    sniffer.setListener((nodeId, data) => {
        var deadSockets: WebSocket[] = [];

        snifferSubscribers.forEach(socket => {
            if (socket.readyState == 1) {
                socket.send(JSON.stringify({
                    source: nodeId, data: data.toString('utf8')
                }));
            }

            if (socket.readyState > 1) {
                deadSockets.push(socket);
            }
        });

        deadSockets.forEach(socket => snifferSubscribers.splice(snifferSubscribers.indexOf(socket), 1));
    });

    currentSnifferFilter = req.body.filter ?? '';

    await sniffer.sniff((await getContainers()).map(c => c.Id), currentSnifferFilter);

    res.json({
        ok: true,
        result: {
            currentFilter: currentSnifferFilter
        }
    });

    next();
});

router.get('/sniff', function (req, res, next) {
    res.json({
        ok: true,
        result: {
            currentFilter: currentSnifferFilter
        }
    });

    next();
});

router.ws('/sniff', async function (ws, req, next) {
    snifferSubscribers.push(ws);
    next();
});

router.get('/container/:id/bgp', async function (req, res, next) {
    let id = req.params.id;

    var candidates = (await docker.listContainers())
        .filter(c => c.Id.startsWith(id));

    if (candidates.length != 1) {
        res.json({
            ok: false,
            result: `no match or multiple match for container ID ${id}.`
        });
        next();
        return;
    }

    let node = candidates[0];

    res.json({
        ok: true,
        result: await controller.listBgpPeers(node.Id)
    });

    next();
});

router.post('/container/:id/bgp/:peer', express.json(), async function (req, res, next) {
    let id = req.params.id;
    let peer = req.params.peer;

    var candidates = (await docker.listContainers())
        .filter(c => c.Id.startsWith(id));

    if (candidates.length != 1) {
        res.json({
            ok: false,
            result: `no match or multiple match for container ID ${id}.`
        });
        next();
        return;
    }

    let node = candidates[0];

    await controller.setBgpPeerState(node.Id, peer, req.body.status);

    res.json({
        ok: true
    });

    next();
});

export = router;