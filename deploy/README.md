# Hosting the PartForge MCP server on a VM

This puts `headless/mcp-http.mjs` on the internet, so PartForge can be added to **claude.ai**
(web, desktop and mobile) as a custom connector. It is one script on one small VM:
- **Node** runs the server under a hardened systemd unit.
- **Caddy** in front gets the TLS certificate and passes through only `/mcp` and `/health`.

## What you need

- **A VM.** Ubuntu 24.04 or 22.04, or Debian 12, with a public IPv4 address.
  - **Size: 2 vCPU, 2 GB RAM.** The server renders on two threads, each needing ~200 MB during a
    render. The heaviest reference part takes ~90 s of CPU. On a single shared vCPU it would take
    longer and could hit claude.ai's 240 s per-call limit.
  - Any provider works (Hetzner, DigitalOcean, Linode, Lightsail, a GCP e2-small…). The script
    uses nothing provider-specific.
- **A hostname you control**, e.g. `mcp.yourdomain.com`, with an **A record** pointing at the VM.
  Add an AAAA record too if the VM has IPv6.
- **Ports 80 and 443 open** in the provider's firewall. Caddy needs both to get and renew the
  certificate. Keep 22 for SSH, and close everything else.

## Install

    ssh root@your-vm
    curl -fsSL https://raw.githubusercontent.com/hudsonclavin-cloud/Partforge/main/deploy/install.sh -o install.sh
    less install.sh                                   # read what it does before running it as root
    DOMAIN=mcp.yourdomain.com bash install.sh

It takes about two minutes. It ends by printing the connector URL.

## Connect it

**claude.ai:** Settings → Connectors → Add custom connector. Paste:

    https://mcp.yourdomain.com/mcp/<token>

The token is in the path because a URL is the one field every client has. Treat the whole URL
like a password. **Claude Code:**

    claude mcp add --transport http partforge https://mcp.yourdomain.com/mcp --header "Authorization: Bearer <token>"

Then ask in a chat: *"Use PartForge to check the coupler-tube template and give me the view link."*

## Operate it

| Task | Command |
|---|---|
| Update to the latest `main` | re-run `install.sh` (the token is kept) |
| New token (revokes the old URL) | `rm /etc/partforge/mcp.env` then re-run `install.sh` |
| Logs | `journalctl -u partforge-mcp -f` · `journalctl -u caddy` |
| Is it up? | `curl https://mcp.yourdomain.com/health` → `ok` |
| Limits | edit `/etc/partforge/mcp.env` (`RATE_PER_MIN`, `MAX_QUEUE`), then `systemctl restart partforge-mcp` |

## What protects it

1. **The token.** Without it every call is 401. It is compared in constant time.
2. **A Host allowlist** of your domain only. A request under any other hostname, including DNS
   rebinding, gets 403.
3. **Per-client rate limit.** 30 calls a minute per client IP by default (429 past it). The limit
   applies to the real client address, which Caddy passes in X-Forwarded-For; that header is
   trusted only from Caddy on this machine.
4. **Resource caps:**
   - at most 4 calls in progress (503 past that)
   - 1 MB request bodies
   - renders killed at 200 s, under claude.ai's 240 s limit
   - the service capped at 1.5 GB of memory and 1.8 CPUs, so SSH stays usable under load
5. **Sandboxing.** The service runs as a locked system user, with a read-only filesystem except
   its cache, no capabilities, and a syscall filter. `systemd-analyze security partforge-mcp`
   rates it **1.3 OK**.
6. **Logging.** Caddy's log drops request URIs and Authorization headers, so the token never
   reaches disk.
7. **No keys or accounts.** The server holds no API keys and calls no external service; a request
   can cost you CPU, and nothing else.

## How this was tested

In a clean Ubuntu 24.04 container:
- `install.sh` ran to completion and wrote the right owners and modes.
- A re-run kept the token.
- The server answered `/health`, refused a missing token (401) and a foreign Host (403), and
  rendered a part.
- Through Caddy, a lookup returned the right answer, other paths gave 404, and the log held no
  token.

Under real systemd, with the unit's full sandbox:
- The service started and checked parts.
- A 5 s render limit killed a slow render, and the next call still worked.
- No syscall was blocked.

The Caddyfile was validated by Caddy 2. Two steps could not run in the test sandbox because its
network policy blocks the hosts: adding the NodeSource and Caddy apt repositories. They are the
vendors' documented commands, and a normal VM reaches both.
