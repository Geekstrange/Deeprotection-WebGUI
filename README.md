# Deeprotection WebGUI

Permalink: Deeprotection WebGUI

Deeprotection WebGUI is a web interface tool for managing Deeprotection. It offers an intuitive interface for configuring protection rules, viewing system status and logs, etc.

## Features

Permalink: Features

- **System Overview**: Displays key info like protection status, expiration time, and protection count.
- **Configuration Management**: Set basic configurations like language, protection switch, and auto-update.
- **Rule Management**: Manage protected paths and command interception rules.
- **Log Viewing**: View system protection logs in real time.
- **Terminal Tool**: Execute system commands for debugging and management.

5. Open a browser and visit `http://127.0.0.1:8080` (default address, modifiable in settings).

## Configuration File

Permalink: Configuration File

The configuration file is located at `/etc/deeprotection/deeprotection.conf` and includes:

- `web_ip`: The IP address the web service binds to.
- `web_port`: The port the web service listens on.
- `web_auth`: Web authentication type (empty for no auth, "password" for password auth, "totp" for TOTP auth)
- `web_password`: Password for password authentication (required if web_auth=password)
- `web_totp_secret`: TOTP secret key (required if web_auth=totp)
- `language`: UI language setting.
- `disable`: Whether to disable protection.
- `expire_hours`: Protection disable expiration time (in hours).
- `update`: Whether to enable auto-update.
- `mode`: Protection mode (Permissive/Enhanced).

It also contains the list of protected paths and command interception rules.

## Logs

Permalink: Logs

System logs are stored in `/var/log/deeprotection.log` and can be viewed in real time via the "Logs" page in the web interface.

## License

Permalink: License

This project is under the Apache License 2.0. See the [LICENSE](https://github.com/Geekstrange/Deeprotection-WebGUI?tab=Apache-2.0-1-ov-file) file for details.
