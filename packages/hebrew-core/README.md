# @astralsync/hebrew-core

Jewish/Mazalot astrology engine (Phase 2a): sunset-aware Hebrew birth date,
month mazal, Sefer Yetzirah month correspondences, day-of-week ruling planet,
and planetary hour of birth. Framework-free TypeScript, same design rules as
`@astralsync/astro-core` — pure computation, no timezone resolution (the
caller supplies the civil date, the resolved UTC instant, and the IANA zone
id), engine name/version self-reported for snapshot metadata.

## License note

The single runtime dependency, [`@hebcal/core`](https://github.com/hebcal/hebcal-es6),
is licensed **GPL-2.0**. AstralSync is currently an unhosted, undistributed
personal app, so no copyleft obligation triggers. Re-evaluate before any
public deployment or distribution — this is an explicit checklist item at the
Phase 4 gate in `TODO.md`.
