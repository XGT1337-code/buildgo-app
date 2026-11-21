/** Common building materials, for search and for site diary notes: [az, ru, en, group]. */
export type MaterialGroup = 'concrete' | 'aggregate' | 'metal' | 'masonry' | 'wood' | 'finish' | 'insulation' | 'pipe' | 'electrical';

export const MATERIALS: [string, string, string, MaterialGroup][] = [
  // Concrete and binders
  ['Beton', 'Бетон', 'Concrete', 'concrete'],
  ['Beton M200', 'Бетон М200', 'Concrete M200 (C12/15)', 'concrete'],
  ['Beton M300', 'Бетон М300', 'Concrete M300 (C20/25)', 'concrete'],
  ['Beton M400', 'Бетон М400', 'Concrete M400 (C30/37)', 'concrete'],
  ['Sement', 'Цемент', 'Cement', 'concrete'],
  ['Məhlul', 'Раствор', 'Mortar', 'concrete'],
  ['Hazır qarışıq', 'Сухая смесь', 'Dry mix', 'concrete'],
  ['Əhəng', 'Известь', 'Lime', 'concrete'],
  ['Gips', 'Гипс', 'Gypsum', 'concrete'],
  // Aggregates
  ['Qum', 'Песок', 'Sand', 'aggregate'],
  ['Çay qumu', 'Речной песок', 'River sand', 'aggregate'],
  ['Çınqıl', 'Щебень', 'Crushed stone', 'aggregate'],
  ['Qum-çınqıl qarışığı', 'ПГС', 'Sand and gravel mix', 'aggregate'],
  ['Qırma daş', 'Отсев', 'Stone screenings', 'aggregate'],
  ['Torpaq', 'Грунт', 'Soil', 'aggregate'],
  ['Asfalt', 'Асфальт', 'Asphalt', 'aggregate'],
  // Metal
  ['Armatur', 'Арматура', 'Rebar', 'metal'],
  ['Profil boru', 'Профильная труба', 'Box section', 'metal'],
  ['İkitavr', 'Двутавр', 'I-beam', 'metal'],
  ['Kanal profil', 'Швеллер', 'Channel', 'metal'],
  ['Künc profil', 'Уголок', 'Steel angle', 'metal'],
  ['Profnastil', 'Профнастил', 'Corrugated sheet', 'metal'],
  ['Hörgü toru', 'Кладочная сетка', 'Masonry mesh', 'metal'],
  ['Məftil', 'Вязальная проволока', 'Tie wire', 'metal'],
  // Masonry
  ['Kərpic', 'Кирпич', 'Brick', 'masonry'],
  ['Qazobeton blok', 'Газобетонный блок', 'Aerated concrete block', 'masonry'],
  ['Beton blok', 'Бетонный блок', 'Concrete block', 'masonry'],
  ['Mişar daşı', 'Пиленый камень (мишар)', 'Sawn limestone (mishar)', 'masonry'],
  ['Səki daşı', 'Брусчатка', 'Paving stone', 'masonry'],
  ['Bordür', 'Бордюр', 'Kerbstone', 'masonry'],
  // Wood
  ['Taxta', 'Доска', 'Timber board', 'wood'],
  ['Brus', 'Брус', 'Beam', 'wood'],
  ['Fanera', 'Фанера', 'Plywood', 'wood'],
  ['OSB', 'OSB', 'OSB', 'wood'],
  // Finishing
  ['Kafel', 'Плитка', 'Tile', 'finish'],
  ['Gips-karton', 'Гипсокартон', 'Plasterboard', 'finish'],
  ['Boya', 'Краска', 'Paint', 'finish'],
  ['Şpaklyovka', 'Шпаклёвка', 'Filler', 'finish'],
  ['Laminat', 'Ламинат', 'Laminate', 'finish'],
  ['Kafel yapışqanı', 'Плиточный клей', 'Tile adhesive', 'finish'],
  // Insulation and roofing
  ['Mineral yun', 'Минвата', 'Mineral wool', 'insulation'],
  ['Penoplast', 'Пенопласт', 'Expanded polystyrene', 'insulation'],
  ['Ekstruziya penopleksi', 'Пеноплекс', 'Extruded polystyrene', 'insulation'],
  ['Hidroizolyasiya membranı', 'Гидроизоляционная мембрана', 'Waterproofing membrane', 'insulation'],
  ['Metal kirəmit', 'Металлочерепица', 'Metal roof tile', 'insulation'],
  ['Ruberoid', 'Рубероид', 'Roofing felt', 'insulation'],
  // Pipes and cables
  ['Polipropilen boru', 'Полипропиленовая труба', 'PPR pipe', 'pipe'],
  ['PVC kanalizasiya borusu', 'Канализационная труба ПВХ', 'PVC sewer pipe', 'pipe'],
  ['Polietilen boru', 'Полиэтиленовая труба (ПНД)', 'HDPE pipe', 'pipe'],
  ['Elektrik kabeli', 'Электрический кабель', 'Power cable', 'electrical'],
  ['Gofrə boru', 'Гофра', 'Flexible conduit', 'electrical'],
];
