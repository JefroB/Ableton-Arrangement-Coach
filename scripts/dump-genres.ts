import { ALL_PROFILES } from "../src/core/genre-registry.js";

const data = ALL_PROFILES.map(p => ({
  id: p.id,
  name: p.name,
  subgenreCount: p.subgenres?.length ?? 0,
  _subgenres: (p.subgenres || []).map(s => ({ id: s.id, name: s.name })),
}));

console.log(JSON.stringify(data));
