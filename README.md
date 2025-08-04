# Deeprotection WebGUI

Deeprotection WebGUI 是一个用于管理Deeprotection的 web 界面工具, 提供了直观的操作界面来配置保护规则、查看系统状态和日志等功能

## 功能特点

- **系统概览**: 展示保护状态、过期时间、保护次数等关键信息
- **配置管理**: 可设置语言、保护开关、自动更新等基础配置
- **规则管理**: 管理受保护路径和命令拦截规则
- **日志查看**: 实时查看系统保护日志
- **终端工具**: 执行系统命令进行调试和管理

5. 打开浏览器访问 `http://127.0.0.1:8080` (默认地址, 可在配置中修改)

## 配置文件

配置文件位于 `/etc/deeprotection/deeprotection.conf`, 包含以下主要配置项:

- `web_ip`: web 服务绑定的 IP 地址
- `web_port`: web 服务监听的端口
- `language`: 界面语言设置
- `disable`: 是否禁用保护功能
- `expire_hours`: 保护禁用的过期时间 (小时)
- `update`: 是否开启自动更新
- `mode`: 保护模式 (Permissive/Enhanced)

此外, 配置文件中还包含受保护路径列表和命令拦截规则

## 日志

系统日志存储在 `/var/log/deeprotection.log`, 可通过 web 界面的 "Logs" 页面实时查看

## 许可证

本项目采用 Apache License 2.0 许可证, 详情参见 [LICENSE](release_bin/LICENSE) 文件
