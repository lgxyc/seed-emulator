配置启动DOCKER监控的docker-compose文件


# 使用说明

1. 修改 prometheus/prometheus.yml 配置文件为主机IP（注意：不可以是 localhost 或者 127.0.0.1)
2. 运行 docker-compose.yml
3. 在grafana 中添加 prometheus 数据源设置 Prometheus server URL 为 http://IP:9090
4. 点击底部的Save & test 出现 Successfully queried the Prometheus API. 为成功连接
5. 将gfarana_config.json导入作为仪表板即可监控运行容器状态信息.
