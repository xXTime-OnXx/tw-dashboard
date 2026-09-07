# Tribal Wars Public Data Endpoints

Here's a concise overview of the **official public Tribal Wars
endpoints** that are available for each world (replace `de257` with the
desired world).

  --------------------------------------------------------------------------------------
  Endpoint                    Format       Description          Typical Fields
  --------------------------- ------------ -------------------- ------------------------
  `/map/player.txt`           CSV-like     All players          `player_id`, `name`,
                                                                `tribe_id`, `villages`,
                                                                `points`, `rank`

  `/map/ally.txt`             CSV-like     All tribes           `tribe_id`, `name`,
                                                                `tag`, `members`,
                                                                `villages`, `points`,
                                                                `rank`

  `/map/village.txt`          CSV-like     All villages         `village_id`, `name`,
                                                                `x`, `y`, `owner_id`,
                                                                `points`

  `/map/conquer.txt`          CSV-like     Complete conquest    `village_id`,
                                           history              `timestamp`,
                                                                `new_owner`, `old_owner`

  `/map/kill_att.txt`         CSV-like     Player offensive     `player_id`, `kills`,
                                           kills (ODA)          `rank`

  `/map/kill_def.txt`         CSV-like     Player defensive     `player_id`, `kills`,
                                           kills (ODD)          `rank`

  `/map/kill_sup.txt`         CSV-like     Player support kills `player_id`, `kills`,
                                                                `rank`

  `/map/kill_all.txt`         CSV-like     Combined player      `player_id`, `kills`,
                                           kills                `rank`

  `/map/kill_att_tribe.txt`   CSV-like     Tribe offensive      `tribe_id`, `kills`,
                                           kills                `rank`

  `/map/kill_def_tribe.txt`   CSV-like     Tribe defensive      `tribe_id`, `kills`,
                                           kills                `rank`

  `/map/kill_all_tribe.txt`   CSV-like     Combined tribe kills `tribe_id`, `kills`,
                                                                `rank`
  --------------------------------------------------------------------------------------

## World configuration

  -------------------------------------------------------------------------------------------
  Endpoint                                  Format             Description
  ----------------------------------------- ------------------ ------------------------------
  `/interface.php?func=get_config`          XML                World settings (speed, unit
                                                               speed, night bonus, morale,
                                                               archers, paladin, church,
                                                               etc.)

  `/interface.php?func=get_unit_info`       XML                Unit stats (attack, defense,
                                                               speed, population, carry
                                                               capacity, build costs,
                                                               research requirements)

  `/interface.php?func=get_building_info`   XML                Building costs, build times,
                                                               max levels, prerequisites and
                                                               effects
  -------------------------------------------------------------------------------------------

## Incremental updates

  ----------------------------------------------------------------------------------------------------
  Endpoint                                                   Description
  ---------------------------------------------------------- -----------------------------------------
  `/interface.php?func=get_conquer&since=<unix_timestamp>`   Returns only conquests since the
                                                             specified timestamp instead of the full
                                                             conquest history.

  ----------------------------------------------------------------------------------------------------

## Compressed downloads

Most map files are also available as:

``` text
/map/player.txt.gz
/map/village.txt.gz
/map/ally.txt.gz
...
```

These are preferable for automated downloads because they're much
smaller.

## Data relationships

``` text
Player
 ├── belongs to one Tribe (tribe_id)
 ├── owns many Villages
 ├── has ODA / ODD / Support statistics
 └── has ranking & points

Tribe
 ├── contains many Players
 ├── owns many Villages
 └── has aggregated statistics

Village
 ├── belongs to one Player
 ├── has coordinates (x,y)
 └── changes owner via Conquer records

Conquer
 ├── references Village
 ├── previous owner
 ├── new owner
 └── timestamp
```
