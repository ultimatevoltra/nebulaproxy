# Pollinations Image Generation — Benchmark Report

**Date:** 2026-09-13 · Tested from Asia/Dhaka sandbox

## Endpoints tested
| Endpoint | Auth | Result |
|---|---|---|
| `https://image.pollinations.ai/prompt/{prompt}` | None (legacy) | ✅ Works — returns JPEG |
| `https://gen.pollinations.ai/image/{prompt}?model=flux` | Requires API key | ❌ 401 Unauthorized |

## Measured timings
| Scenario | Result |
|---|---|
| Cached/simple prompt | ~0.27s (instant, already generated & cached) |
| **Unique (uncached) prompt — sequential** | **~38–45s each**, consistent |
| 5 parallel unique images | wall 20.7s, only **1/5 succeeded** |
| 10 parallel unique images | wall 44.4s, only **1/10 succeeded** |

## Key finding
The legacy free Pollinations endpoint **rate-limits hard on UNIQUE generations**:
- Sequential unique images: **~45s each**
- Parallel/concurrent unique requests: **~90% fail** (only 1/10 succeed)

So sustained throughput ≈ **1 unique image / 45 seconds**.

## Time to generate "hundreds" of images
| Images | Time |
|---|---|
| 10 | ~7m 30s |
| 100 | ~1h 15m |
| 200 | ~2h 30m |
| 500 | ~6h 15m |
| 1000 | ~12h 30m |

**Conclusion:** "Hundreds of unique images" via Pollinations = **hours to half a day** at the measured 45s/image, and concurrency does NOT help (rate-limited). Only cached/simple prompts are fast. To actually generate hundreds of *unique* images would need either a paid/keyed tier or a different provider.