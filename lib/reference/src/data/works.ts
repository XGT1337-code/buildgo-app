/** Kinds of construction work, used for profiles, sites and search: [az, ru, en, group]. */
export type WorkGroup = 'earth' | 'foundation' | 'frame' | 'roof' | 'finish' | 'utilities' | 'road' | 'demolition' | 'landscape';

export const WORKS: [string, string, string, WorkGroup][] = [
  // Earthworks
  ['Torpaq işləri', 'Земляные работы', 'Earthworks', 'earth'],
  ['Özül çuxurunun qazılması', 'Рытьё котлована', 'Excavating a pit', 'earth'],
  ['Xəndək qazılması', 'Рытьё траншей', 'Trenching', 'earth'],
  ['Ərazinin planlaşdırılması', 'Планировка участка', 'Site grading', 'earth'],
  ['Torpağın daşınması', 'Вывоз грунта', 'Soil removal', 'earth'],
  ['Geri doldurma', 'Обратная засыпка', 'Backfilling', 'earth'],
  ['Quyu qazılması', 'Бурение скважин', 'Well drilling', 'earth'],
  // Foundations
  ['Bünövrə', 'Фундамент', 'Foundation', 'foundation'],
  ['Lent bünövrə', 'Ленточный фундамент', 'Strip foundation', 'foundation'],
  ['Plitə bünövrə', 'Монолитная плита', 'Slab foundation', 'foundation'],
  ['Svay işləri', 'Свайные работы', 'Piling', 'foundation'],
  ['Betonlama', 'Бетонирование', 'Concrete pouring', 'foundation'],
  ['Armaturlama', 'Армирование', 'Rebar work', 'foundation'],
  ['Hidroizolyasiya', 'Гидроизоляция', 'Waterproofing', 'foundation'],
  // Frame and walls
  ['Monolit karkas', 'Монолитный каркас', 'Concrete frame', 'frame'],
  ['Hörgü işləri', 'Кладка', 'Masonry', 'frame'],
  ['Kərpic hörgüsü', 'Кирпичная кладка', 'Brickwork', 'frame'],
  ['Blok hörgüsü', 'Кладка блоков', 'Blockwork', 'frame'],
  ['Metal konstruksiyalar', 'Металлоконструкции', 'Steel structures', 'frame'],
  ['Qaynaq işləri', 'Сварочные работы', 'Welding', 'frame'],
  ['Montaj işləri', 'Монтажные работы', 'Installation and lifting', 'frame'],
  ['Qəlib işləri', 'Опалубочные работы', 'Formwork', 'frame'],
  // Roof and facade
  ['Dam örtüyü', 'Кровельные работы', 'Roofing', 'roof'],
  ['Fasad işləri', 'Фасадные работы', 'Facade work', 'roof'],
  ['İstilik izolyasiyası', 'Утепление', 'Insulation', 'roof'],
  ['Pəncərə quraşdırılması', 'Монтаж окон', 'Window installation', 'roof'],
  // Finishing
  ['Daxili təmir', 'Внутренняя отделка', 'Interior finishing', 'finish'],
  ['Suvaq', 'Штукатурка', 'Plastering', 'finish'],
  ['Döşəmə şapı', 'Стяжка пола', 'Floor screed', 'finish'],
  ['Kafel döşənməsi', 'Укладка плитки', 'Tiling', 'finish'],
  ['Rəngləmə', 'Покраска', 'Painting', 'finish'],
  ['Gips-karton', 'Гипсокартон', 'Drywall', 'finish'],
  ['Döşəmə örtüyü', 'Напольные покрытия', 'Flooring', 'finish'],
  // Utilities
  ['Elektrik işləri', 'Электромонтаж', 'Electrical work', 'utilities'],
  ['Santexnika', 'Сантехника', 'Plumbing', 'utilities'],
  ['Havalandırma və kondisioner', 'Вентиляция и кондиционирование', 'HVAC', 'utilities'],
  ['İstilik sistemi', 'Отопление', 'Heating', 'utilities'],
  ['Kanalizasiya', 'Канализация', 'Sewerage', 'utilities'],
  ['Su xətti', 'Водопровод', 'Water mains', 'utilities'],
  ['Qaz xətti', 'Газопровод', 'Gas lines', 'utilities'],
  // Roads
  ['Yol tikintisi', 'Дорожное строительство', 'Road building', 'road'],
  ['Asfaltlama', 'Асфальтирование', 'Asphalt paving', 'road'],
  ['Səki daşı döşənməsi', 'Укладка брусчатки', 'Paving stones', 'road'],
  ['Bordür quraşdırılması', 'Установка бордюров', 'Kerbs', 'road'],
  ['Yolun təmiri', 'Ремонт дорог', 'Road repair', 'road'],
  // Demolition
  ['Sökülmə', 'Демонтаж', 'Demolition', 'demolition'],
  ['Binanın sökülməsi', 'Снос зданий', 'Building demolition', 'demolition'],
  ['Betonun kəsilməsi', 'Резка бетона', 'Concrete cutting', 'demolition'],
  ['Tikinti tullantılarının daşınması', 'Вывоз строительного мусора', 'Debris removal', 'demolition'],
  // Landscaping
  ['Abadlıq', 'Благоустройство', 'Landscaping', 'landscape'],
  ['Hasar tikintisi', 'Строительство забора', 'Fencing', 'landscape'],
  ['Yaşıllaşdırma', 'Озеленение', 'Planting', 'landscape'],
];
