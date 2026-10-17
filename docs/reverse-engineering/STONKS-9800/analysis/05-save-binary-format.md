# STONKS-9800 — Save file binary format (verified)

Verified empirically against the real save by decoding the raw bytes, and cross-checked
against the game's own loader (`gml_GlobalScript_loadgame.gml:152-177`) and logger
(`gml_GlobalScript_money_delete.gml:25-40`).

> **Correction to earlier work in this project.** The first pass labelled these blobs
> "packed float32s" from hex-length arithmetic. That was **wrong**. They are GameMaker
> **native `ds_list_write` output**, decoded by the built-in `ds_list_read()`. An earlier
> intermediate reading of "272 float32" and "136 float64" were both artefacts of ignoring
> the per-element type tag. The correct layout is below.

## Container

`saveslot_auto.save` is **base64 → raw zlib (deflate) → UTF-8 text INI**.

- The base64 text begins `eJz…` = `0x78 0x01`, the zlib header.
- Inflated: 216,685 bytes of INI, CRLF line endings.
- Sections: `[global] [company] [people] [arrays] [local] [chart] [chart2] [cars] [house] [logs] [compp]`
- `savedb.9800` is a separate plain-INI save index (`[saveslot_auto] time=2005/4/11 name=… mode=0`).

## DS_LIST blob encoding

Any value stored as a hex string is `ds_list_write` output:

```
offset 0  u32   303 (0x012F)   DS_LIST marker
offset 4  u32   element count
offset 8  u32   0             (padding / reserved)
offset 12 u32   nesting depth
offset 16 u32   inner element count   (only when entries are arrays)
then      per element:
              u32   variant type  (0 = real/float64, 1 = string, 2 = nested array/list)
              ...   payload: 8-byte little-endian float64, or u32 length + UTF-8 bytes
```

The nesting header appears when the list holds arrays (as `logs` does).

### Verified example — `chart_series_data_0` (1088 bytes)

```
u32[0] = 303        DS_LIST marker
u32[1] = 90         element count          <- the cap
u32[2] = 0
then 90 x 12 bytes { u32 type = 0 ; float64 value }
8 + 90*12 = 1088 exactly
```

Decoded leading values: `138243.3068, 135949.0646, 133598.9108, 302474.5757,
301305.7834, 298464.3601, 298182.4259, 296349.8683, 291441.3688, 289378.0575` —
plausible per-share prices. The **final** value is `317500.7874`, which equals
`company_stockprice_0 / company_number_a_0 = 123725611842.75302 / 389686.0` exactly.

The series stores the **quoted per-share price**, one point per update.

**Capacity is exactly 90**, enforced in three places:
- `update_price.gml:11-22` — stocks drop the head once `o_control.gameday > 2`
- `commodity_update.gml:41` — `if (ds_list_size(...) > 90) ds_list_delete(..., 0)`
- `loadgame.gml:158,187` — load reads exactly 90 slots, substituting `0` for undefined

### Verified example — `logs` (581,682 bytes)

```
u32[0] = 303        DS_LIST marker
u32[1] = 9078       element count (newest first)
u32[2] = 2          nesting depth
u32[3] = 5          inner element count
```

Each entry is a **5-element array**, built by `add_log` (`money_delete.gml:25-40`):

```gml
function add_log(arg0, arg1 = 0, arg2 = -1, arg3 = "") {
    var arra = [global.mydata, arg0, arg1, arg2, arg3];
    if (arg0 != 0) ds_list_insert(global.logs, 0, arra);   // inserted at the HEAD
}
```

| # | field | type | meaning |
|---|---|---|---|
| 0 | `global.mydata` | real | GameMaker date value, e.g. `38452.916672453706` ≈ a day in 2005 |
| 1 | `arg0` | real | signed amount, RUB (negative = expense) |
| 2 | `arg1` | real | `txt()` id of the reason, e.g. `1544` = "Purchase of real estate" |
| 3 | `arg2` | real | company index, `-1` = not company-specific |
| 4 | `arg3` | string | pre-formatted amount/detail string |

Because field 4 is a string, records are **variable length** (a typical record is ~60 bytes
when field 4 is short), so the blob is not an exact multiple of any fixed stride.
`ds_list_insert(..., 0, ...)` means **index 0 is the most recent entry**.

## Resolving `txt()` ids

The game's string table is **not** in the GMS string table (which holds variable names).
It ships as an external TSV beside the executable:

```
D:\Games\STONKS-9800 Stock Market Simulator\stonks.csv
```

4,289 rows × 5 columns — `id \t English \t Українська \t 日本語 \t 한국어`.
`txt(N)` = column 2 of the row whose column 0 is the integer `N` (row 0 is the header `w`).
A second community table `stonksptbrcompleto.csv` (4,306 rows × 8 cols, Portuguese) is also
present. Full English dump: `D:\stonks-re\localization\stonks_english.txt`.

Common money codes:

| id | text | id | text |
|---|---|---|---|
| 25 | Income tax | 1529 | Paying off a debt |
| 290 | Insurance | 1530 | Money on loan |
| 669 | Rental income | 1531 | Charity |
| 670 | Real estate tax | 1532 | Investment |
| 1394 | Salary of member of the Board of Directors | 1534 | Shares of \<arg0\> each |
| 1395 | Salary of CEO | 1535 | Selling a car |
| 1528 | Purchase of data | 1543 | Car maintenance |
| 1544 | Purchase of real estate | 1548 | Daily expenses |
| 1554 | Gift | 1556 | Part-time job |
| 1557 | Profit from investment | 1559 | Debt repayment |
| 1562 | Sale of real estate | 1563 | Shares of \<arg0\> each (short) |
| 1934 | Artifact | 3880 | USD to JPY exchange rate |

## Other arrays

| key | encoding | notes |
|---|---|---|
| `global.inventory` | 128 bytes | same DS_LIST layout, 10 slots — packed player stock holdings |
| `human_list_N` | DS_LIST | per-NPC stat block; variable because it holds strings |
| `houses` | DS_LIST | property array (~5,779 entries in the sample) |
| `cars`, `brand_list` | DS_LIST | vehicle + brand arrays |
| `dohodmesyac_N_M`, `dohodmesyac_all_N_M` | INI scalars | 12-month income history per company |

## Integrity

`savegame.gml` also carries `hex_string_byte`, `sha1_string_utf1_hmac` and
`buffer_load_safe`, which implement an **HMAC-SHA1** integrity check (last 40 hex chars of
the payload are the digest; `buffer_base64_decode` on the rest) used for
`buffer_save`-with-encryption payloads. The `saveslot_auto.save` INI itself is **not**
HMAC-protected — it is plain base64+zlib and freely editable.
