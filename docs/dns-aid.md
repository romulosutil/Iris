# DNS-AID (DNS for AI Discovery) Specification & Deployment Guide

This document details the **DNS for AI Discovery (DNS-AID)** implementation for Iris, based on [draft-mozleywilliams-dnsop-dnsaid](https://datatracker.ietf.org/doc/draft-mozleywilliams-dnsop-dnsaid/) and [RFC 9460](https://www.rfc-editor.org/rfc/rfc9460).

---

## 1. Overview

DNS-AID leverages DNS Service Binding (SVCB) and HTTPS records under dedicated `_agents` labels to enable high-performance, DNS-level discovery of AI services, agent endpoints, and API catalogs before an HTTP connection is established.

---

## 2. Record Standards & Syntax

DNS-AID records are published under the `_agents` namespace:

- `_index._agents.iris.app`: Main AI service index endpoint.
- `_a2a._agents.iris.app`: Agent-to-Agent communication endpoint.

### Record Parameters (RFC 9460):
- **ALPN**: Application-Layer Protocol Negotiation (`h2,h3`).
- **Endpoint**: Relative URI path pointing to agent discovery metadata (`/.well-known/api-catalog`).

---

## 3. Sample BIND Zone Configuration

The reference zone file is located in [`ops/dns/dns-aid.zone`](file:///c:/Users/sutil/Documents/dev/PESSOAL/apps/iris/ops/dns/dns-aid.zone):

```bind
; DNS-AID Records for iris.app
$TTL 3600

; Main Agent Discovery Index
_index._agents.iris.app. IN HTTPS 1 iris.app. (
    alpn="h2,h3"
    port="443"
    key65300="/.well-known/api-catalog"
)

; Agent-to-Agent (A2A) Endpoint
_a2a._agents.iris.app. IN HTTPS 1 iris.app. (
    alpn="h2,h3"
    port="443"
    key65300="/.well-known/mcp/server-card.json"
)
```

---

## 4. DNSSEC Validation Requirement

Per DNS-AID specification, all public DNS-AID records MUST be signed with **DNSSEC**:
1. Ensure `dnssec-enable yes;` and `dnssec-validation auto;` are configured in your DNS resolver.
2. Sign the zone using RRSIG and publish DS records at your TLD registrar.
3. Resolvers will return the `AD` (Authenticated Data) flag, confirming authentic agent discovery metadata.
