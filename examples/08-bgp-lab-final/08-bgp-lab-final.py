from seedsim.layers import Base, Routing, Ebgp, PeerRelationship, Ibgp, Ospf, WebService, Router
from seedsim.sim import Renderer
from seedsim.compiler import Docker
from seedsim.core import Simulator

sim = Simulator()

base = Base(sim)
routing = Routing(sim)
ebgp = Ebgp(sim)
ibgp = Ibgp(sim)
ospf = Ospf(sim)
web = WebService(sim)

###############################################################################

def make_stub_as(asn: int, exchange: str):
    stub_as = base.createAutonomousSystem(asn)

    web_server = stub_as.createHost('web')
    web.installOn(web_server)

    router = stub_as.createRouter('router0')

    net = stub_as.createNetwork('net0')

    routing.addDirect(net)

    web_server.joinNetwork(net)
    router.joinNetwork(net)

    router.joinNetworkByName(exchange)

###############################################################################

base.createInternetExchange(100)
base.createInternetExchange(101)
base.createInternetExchange(102)

###############################################################################

make_stub_as(150, 'ix100')
make_stub_as(151, 'ix100')

make_stub_as(152, 'ix101')

make_stub_as(160, 'ix102')
make_stub_as(161, 'ix102')

###############################################################################

as2 = base.createAutonomousSystem(2)

as2_100 = as2.createRouter('r0')
as2_101 = as2.createRouter('r1')
as2_102 = as2.createRouter('r2')

as2_100.joinNetworkByName('ix100')
as2_101.joinNetworkByName('ix101')
as2_102.joinNetworkByName('ix102')

as2_net_100_101 = as2.createNetwork('n01')
as2_net_101_102 = as2.createNetwork('n12')
as2_net_102_100 = as2.createNetwork('n20')

routing.addDirect(as2_net_100_101)
routing.addDirect(as2_net_101_102)
routing.addDirect(as2_net_102_100)

as2_100.joinNetwork(as2_net_100_101)
as2_101.joinNetwork(as2_net_100_101)

as2_101.joinNetwork(as2_net_101_102)
as2_102.joinNetwork(as2_net_101_102)

as2_102.joinNetwork(as2_net_102_100)
as2_100.joinNetwork(as2_net_102_100)

###############################################################################

as3 = base.createAutonomousSystem(3)

as3_101 = as3.createRouter('r1')
as3_102 = as3.createRouter('r2')

as3_101.joinNetworkByName('ix101')
as3_102.joinNetworkByName('ix102')

as3_net_101_102 = as3.createNetwork('n12')

routing.addDirect(as3_net_101_102)

as3_101.joinNetwork(as3_net_101_102)
as3_102.joinNetwork(as3_net_101_102)

###############################################################################

ebgp.addPrivatePeering(100, 2, 150, PeerRelationship.Provider)
ebgp.addPrivatePeering(100, 150, 151, PeerRelationship.Provider)

ebgp.addPrivatePeering(101, 2, 3, PeerRelationship.Provider)
ebgp.addPrivatePeering(101, 2, 152, PeerRelationship.Provider)
ebgp.addPrivatePeering(101, 3, 152, PeerRelationship.Provider)

ebgp.addPrivatePeering(102, 2, 160, PeerRelationship.Provider)
ebgp.addPrivatePeering(102, 3, 160, PeerRelationship.Provider)
ebgp.addPrivatePeering(102, 3, 161, PeerRelationship.Provider)

###############################################################################

sim.addLayer(base)
sim.addLayer(routing)
sim.addLayer(ebgp)
sim.addLayer(ibgp)
sim.addLayer(ospf)
sim.addLayer(web)

sim.render()

###############################################################################

sim.compile(Docker(), './bgp-lab-final')