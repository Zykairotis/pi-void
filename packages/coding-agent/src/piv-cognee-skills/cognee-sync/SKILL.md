---
name: cognee-sync
description: Bridge Cognee session cache into the permanent knowledge graph and check integration health.
---

# Cognee sync / doctor (Pi Void)

## Bridge session → graph

```text
/cognee improve now
```

Or enable automatic SessionEnd bridge:

```text
/cognee improve on
```

## Health

```text
/cognee doctor
/cognee status
```

## Flush durable remember queue

```text
/cognee flush pending
/cognee flush uncertain
```

Uncertain writes are never auto-replayed (may have already landed).
