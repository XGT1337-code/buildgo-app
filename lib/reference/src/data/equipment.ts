/**
 * Construction machinery, trucks and tools. `category` maps onto the app's rental categories; `license` says
 * which licence or certificate operating it requires (see vehicle.ts); `plate` = registered with a state number.
 */
export type RentalCategory = 'earthmoving' | 'trucks' | 'lifting' | 'concrete' | 'road' | 'tools';
/**
 * machine: wheeled self-propelled machine (tractor-driver certificate by power); tracked: tracked machine;
 * truck: lorry (C); semi: tractor unit with semi-trailer (CE); crane: crane operator; lift: aerial work platform operator.
 */
export type LicenseKind = 'machine' | 'tracked' | 'truck' | 'semi' | 'crane' | 'lift' | null;

export interface EquipmentType {
  id: string; az: string; ru: string; en: string;
  category: RentalCategory;
  selfPropelled: boolean;
  plate: boolean;
  license: LicenseKind;
}

const T = (id: string, az: string, ru: string, en: string, category: RentalCategory, selfPropelled: boolean, plate: boolean, license: LicenseKind): EquipmentType =>
  ({ id, az, ru, en, category, selfPropelled, plate, license });

export const EQUIPMENT_TYPES: EquipmentType[] = [
  // Earthmoving
  T('crawler-excavator', 'Tırtıllı ekskavator', 'Гусеничный экскаватор', 'Crawler excavator', 'earthmoving', true, true, 'tracked'),
  T('wheeled-excavator', 'Təkərli ekskavator', 'Колёсный экскаватор', 'Wheeled excavator', 'earthmoving', true, true, 'machine'),
  T('mini-excavator', 'Mini ekskavator', 'Мини-экскаватор', 'Mini excavator', 'earthmoving', true, true, 'tracked'),
  T('backhoe-loader', 'Ekskavator-yükləyici', 'Экскаватор-погрузчик', 'Backhoe loader', 'earthmoving', true, true, 'machine'),
  T('bulldozer', 'Buldozer', 'Бульдозер', 'Bulldozer', 'earthmoving', true, true, 'tracked'),
  T('wheel-loader', 'Frontal yükləyici', 'Фронтальный погрузчик', 'Wheel loader', 'earthmoving', true, true, 'machine'),
  T('skid-steer', 'Mini yükləyici', 'Мини-погрузчик', 'Skid steer loader', 'earthmoving', true, true, 'machine'),
  T('trencher', 'Xəndəkqazan', 'Траншеекопатель', 'Trencher', 'earthmoving', true, true, 'machine'),
  T('drilling-rig', 'Qazma qurğusu', 'Буровая установка', 'Drilling rig', 'earthmoving', true, true, 'tracked'),
  T('pile-driver', 'Svayvuran', 'Сваебойная установка', 'Pile driver', 'earthmoving', true, true, 'tracked'),
  T('hydraulic-breaker', 'Hidravlik çəkic', 'Гидромолот', 'Hydraulic breaker', 'earthmoving', false, false, null),
  // Trucks
  T('dump-truck', 'Özüboşaldan', 'Самосвал', 'Dump truck', 'trucks', true, true, 'truck'),
  T('articulated-hauler', 'Oynaqlı özüboşaldan', 'Сочленённый самосвал', 'Articulated hauler', 'trucks', true, true, 'machine'),
  T('flatbed-truck', 'Bortlu yük maşını', 'Бортовой грузовик', 'Flatbed truck', 'trucks', true, true, 'truck'),
  T('crane-truck', 'Manipulyator', 'Манипулятор (КМУ)', 'Truck with loader crane', 'trucks', true, true, 'truck'),
  T('tractor-unit', 'Yedək dartıcı', 'Седельный тягач', 'Tractor unit', 'trucks', true, true, 'semi'),
  T('lowboy', 'Tral (alçaq platforma)', 'Трал (низкорамный)', 'Lowboy trailer', 'trucks', false, true, null),
  T('tipper-semitrailer', 'Özüboşaldan yarımqoşqu', 'Самосвальный полуприцеп', 'Tipper semi-trailer', 'trucks', false, true, null),
  T('water-truck', 'Su daşıyan', 'Водовоз', 'Water truck', 'trucks', true, true, 'truck'),
  T('fuel-truck', 'Yanacaq doldurucu', 'Топливозаправщик', 'Fuel truck', 'trucks', true, true, 'truck'),
  T('van', 'Furqon', 'Фургон', 'Van', 'trucks', true, true, 'truck'),
  // Lifting
  T('truck-crane', 'Avtokran', 'Автокран', 'Truck crane', 'lifting', true, true, 'crane'),
  T('crawler-crane', 'Tırtıllı kran', 'Гусеничный кран', 'Crawler crane', 'lifting', true, true, 'crane'),
  T('tower-crane', 'Qüllə kranı', 'Башенный кран', 'Tower crane', 'lifting', false, false, 'crane'),
  T('aerial-platform', 'Avtoqaldırıcı (vışka)', 'Автовышка', 'Truck-mounted aerial platform', 'lifting', true, true, 'lift'),
  T('scissor-lift', 'Qayçılı qaldırıcı', 'Ножничный подъёмник', 'Scissor lift', 'lifting', true, false, 'lift'),
  T('boom-lift', 'Teleskopik qaldırıcı', 'Коленчатый подъёмник', 'Boom lift', 'lifting', true, false, 'lift'),
  T('telehandler', 'Teleskopik yükləyici', 'Телескопический погрузчик', 'Telehandler', 'lifting', true, true, 'machine'),
  T('forklift', 'Avtoyükləyici (forklift)', 'Вилочный погрузчик', 'Forklift', 'lifting', true, false, 'machine'),
  T('construction-hoist', 'Tikinti liftı', 'Строительный подъёмник', 'Construction hoist', 'lifting', false, false, null),
  // Concrete
  T('mixer-truck', 'Avtobetonqarışdıran (mikser)', 'Автобетоносмеситель (миксер)', 'Concrete mixer truck', 'concrete', true, true, 'truck'),
  T('concrete-pump', 'Avtobeton nasosu', 'Автобетононасос', 'Truck-mounted concrete pump', 'concrete', true, true, 'truck'),
  T('line-pump', 'Stasionar beton nasosu', 'Стационарный бетононасос', 'Line concrete pump', 'concrete', false, false, null),
  T('concrete-mixer', 'Betonqarışdıran', 'Бетономешалка', 'Concrete mixer', 'concrete', false, false, null),
  T('concrete-vibrator', 'Beton vibratoru', 'Глубинный вибратор', 'Concrete vibrator', 'concrete', false, false, null),
  T('power-trowel', 'Beton hamarlayan', 'Затирочная машина («вертолёт»)', 'Power trowel', 'concrete', false, false, null),
  T('plaster-machine', 'Suvaq stansiyası', 'Штукатурная станция', 'Plastering machine', 'concrete', false, false, null),
  // Road
  T('road-roller', 'Yol katoku', 'Дорожный каток', 'Road roller', 'road', true, true, 'machine'),
  T('motor-grader', 'Avtoqreyder', 'Автогрейдер', 'Motor grader', 'road', true, true, 'machine'),
  T('asphalt-paver', 'Asfaltdöşəyən', 'Асфальтоукладчик', 'Asphalt paver', 'road', true, true, 'tracked'),
  T('cold-planer', 'Yol frezi', 'Дорожная фреза', 'Cold planer', 'road', true, true, 'machine'),
  T('plate-compactor', 'Vibroplita', 'Виброплита', 'Plate compactor', 'road', false, false, null),
  T('rammer', 'Vibrotoplayıcı', 'Вибротрамбовка', 'Rammer', 'road', false, false, null),
  // Tools and site power
  T('rotary-hammer', 'Perforator', 'Перфоратор', 'Rotary hammer', 'tools', false, false, null),
  T('drill', 'Drel / burğu', 'Дрель / шуруповёрт', 'Drill / driver', 'tools', false, false, null),
  T('demolition-hammer', 'Sökücü çəkic', 'Отбойный молоток', 'Demolition hammer', 'tools', false, false, null),
  T('angle-grinder', 'Bolqarka', 'Болгарка (УШМ)', 'Angle grinder', 'tools', false, false, null),
  T('cut-off-saw', 'Benzinli kəsici', 'Бензорез', 'Cut-off saw', 'tools', false, false, null),
  T('floor-saw', 'Tikiş kəsən', 'Швонарезчик', 'Floor saw', 'tools', false, false, null),
  T('core-drill', 'Almaz qazma qurğusu', 'Установка алмазного бурения', 'Core drill', 'tools', false, false, null),
  T('welder', 'Qaynaq aparatı', 'Сварочный аппарат', 'Welder', 'tools', false, false, null),
  T('generator', 'Generator', 'Генератор', 'Generator', 'tools', false, false, null),
  T('compressor', 'Kompressor', 'Компрессор', 'Air compressor', 'tools', false, false, null),
  T('pump', 'Su nasosu', 'Мотопомпа / дренажный насос', 'Water pump', 'tools', false, false, null),
  T('scaffolding', 'Tikinti meşəsi (lesa)', 'Строительные леса', 'Scaffolding', 'tools', false, false, null),
  T('laser-level', 'Lazer nivelir', 'Лазерный нивелир', 'Laser level', 'tools', false, false, null),
  T('tile-cutter', 'Kafel kəsən', 'Плиткорез', 'Tile cutter', 'tools', false, false, null),
];

export type BrandKind = 'truck' | 'excavator' | 'loader' | 'crane' | 'concrete' | 'road' | 'lift' | 'tool' | 'power';

/** Manufacturers sold or used in Azerbaijan and the region, with their common models. */
export const BRANDS: { name: string; aliases?: string[]; country: string; kinds: BrandKind[]; models: string[] }[] = [
  // Trucks
  { name: 'KamAZ', aliases: ['КамАЗ', 'Kamaz', 'КАМАЗ'], country: 'RU', kinds: ['truck', 'concrete'],
    models: ['43118', '4308', '5320', '53215', '55111', '65111', '65115', '65116', '6520', '6522', '6580', '54115', '5490', '54901', '65206', '65801'] },
  { name: 'MAZ', aliases: ['МАЗ'], country: 'BY', kinds: ['truck'], models: ['5337', '5440', '5516', '5551', '6312', '6430', '6501', '6516', '6517'] },
  { name: 'Ural', aliases: ['Урал'], country: 'RU', kinds: ['truck'], models: ['4320', '5557', 'Next 4320', '6370'] },
  { name: 'GAZ', aliases: ['ГАЗ', 'Gazelle', 'Газель'], country: 'RU', kinds: ['truck'], models: ['GAZelle Next', 'GAZon Next', 'Sadko Next', 'GAZ-3307', 'GAZ-53'] },
  { name: 'ZIL', aliases: ['ЗИЛ'], country: 'RU', kinds: ['truck'], models: ['ZIL-130', 'ZIL-131', 'ZIL-MMZ-4502'] },
  { name: 'HOWO', aliases: ['Sinotruk', 'Хово', 'Синотрук'], country: 'CN', kinds: ['truck', 'concrete'], models: ['HOWO A7', 'HOWO T5G', 'HOWO TX', 'HOWO 371', 'HOWO ZZ3257', 'HOWO TH7'] },
  { name: 'Shacman', aliases: ['Shaanxi', 'Шакман'], country: 'CN', kinds: ['truck'], models: ['F2000', 'F3000', 'X3000', 'X5000', 'X6000', 'H3000'] },
  { name: 'FAW', aliases: ['ФАВ'], country: 'CN', kinds: ['truck'], models: ['J6P', 'CA3250', 'Tiger V'] },
  { name: 'Dongfeng', aliases: ['Донгфенг'], country: 'CN', kinds: ['truck'], models: ['KX', 'KC', 'Captain'] },
  { name: 'Mercedes-Benz', aliases: ['Mercedes', 'Мерседес'], country: 'DE', kinds: ['truck', 'concrete'], models: ['Actros', 'Arocs', 'Axor', 'Atego', 'Sprinter'] },
  { name: 'MAN', aliases: ['МАН'], country: 'DE', kinds: ['truck'], models: ['TGS', 'TGX', 'TGA', 'TGM'] },
  { name: 'Volvo Trucks', aliases: ['Volvo FH', 'Вольво'], country: 'SE', kinds: ['truck'], models: ['FH', 'FH16', 'FM', 'FMX'] },
  { name: 'Scania', aliases: ['Скания'], country: 'SE', kinds: ['truck'], models: ['P-series', 'G-series', 'R-series', 'XT'] },
  { name: 'DAF', country: 'NL', kinds: ['truck'], models: ['CF', 'XF', 'LF'] },
  { name: 'Iveco', aliases: ['Ивеко'], country: 'IT', kinds: ['truck'], models: ['Trakker', 'Stralis', 'Eurocargo', 'Daily'] },
  { name: 'Isuzu', aliases: ['Исузу'], country: 'JP', kinds: ['truck'], models: ['NPR', 'NQR', 'FVR', 'Giga'] },
  { name: 'Hyundai Trucks', aliases: ['Hyundai HD'], country: 'KR', kinds: ['truck'], models: ['HD78', 'HD120', 'HD270', 'Xcient'] },
  // Earthmoving, road and lifting machines
  { name: 'Caterpillar', aliases: ['CAT', 'Катерпиллер'], country: 'US', kinds: ['excavator', 'loader', 'road'],
    models: ['301.7', '308', '320', '320D', '323', '330', '336', '349', 'M318', '428', '432', '444', '262D', 'D6', 'D8', 'D9', '950', '966', '980', '140K', '12M', 'CB10', 'CS56', 'AP555'] },
  { name: 'Komatsu', aliases: ['Комацу'], country: 'JP', kinds: ['excavator', 'loader', 'road'],
    models: ['PC78', 'PC200', 'PC210', 'PC220', 'PC300', 'PC400', 'PW180', 'WB93', 'WB97', 'D65', 'D155', 'WA320', 'WA380', 'WA470', 'GD555'] },
  { name: 'Hitachi', aliases: ['Хитачи'], country: 'JP', kinds: ['excavator', 'loader'], models: ['ZX55U', 'ZX135', 'ZX160W', 'ZX200', 'ZX210', 'ZX250', 'ZX330', 'ZX470', 'ZW180'] },
  { name: 'JCB', aliases: ['ДжейСиБи'], country: 'GB', kinds: ['excavator', 'loader', 'lift'],
    models: ['1CX', '3CX', '4CX', '8030', 'JS130', 'JS220', 'JS330', '155', '19C-1', '531-70', '535-125', '540-170', '426', '457'] },
  { name: 'Hyundai CE', aliases: ['Hyundai', 'Хендай', 'HD Hyundai'], country: 'KR', kinds: ['excavator', 'loader'], models: ['R55', 'R140W', 'R210', 'R220LC-9', 'R300', 'R380', 'HL757', 'HL960'] },
  { name: 'Develon', aliases: ['Doosan', 'Дусан', 'Девелон'], country: 'KR', kinds: ['excavator', 'loader'], models: ['DX55', 'DX140W', 'DX225', 'DX300', 'DX380', 'DL300', 'DL420'] },
  { name: 'Volvo CE', aliases: ['Volvo'], country: 'SE', kinds: ['excavator', 'loader', 'road'], models: ['EC140', 'EC220', 'EC300', 'EC480', 'EW160', 'L60', 'L120', 'L150', 'A30G', 'A40G', 'SD110', 'P6820'] },
  { name: 'Liebherr', aliases: ['Либхерр'], country: 'DE', kinds: ['excavator', 'loader', 'crane', 'concrete'],
    models: ['R 914', 'R 924', 'R 936', 'A 918', 'L 556', 'L 566', 'LTM 1050', 'LTM 1100', 'LTM 1200', 'LTM 1300', 'LR 1300', '132 EC-H', '280 EC-H', 'HTM 904'] },
  { name: 'XCMG', aliases: ['ХСМГ'], country: 'CN', kinds: ['excavator', 'loader', 'crane', 'road', 'concrete'],
    models: ['XE60', 'XE215', 'XE370', 'LW300', 'LW500', 'ZL50G', 'QY25K', 'QY50K', 'XCT25', 'XCT55', 'GR165', 'GR215', 'XS143', 'XS183', 'XZJ5', 'HB52'] },
  { name: 'SANY', aliases: ['Сани', 'Sany'], country: 'CN', kinds: ['excavator', 'crane', 'concrete', 'road'],
    models: ['SY35', 'SY75', 'SY215', 'SY365', 'SY500', 'STC250', 'STC500', 'SAC1200', 'SYM5', '62m pump', 'SSR180', 'SR235'] },
  { name: 'Zoomlion', aliases: ['Зумлион'], country: 'CN', kinds: ['excavator', 'crane', 'concrete'], models: ['ZE60', 'ZE215', 'ZTC250', 'QY25V', 'ZAT600', '56X-6RZ', 'TC5613'] },
  { name: 'LiuGong', aliases: ['Лиугонг'], country: 'CN', kinds: ['excavator', 'loader', 'road'], models: ['CLG856', 'CLG862', 'CLG922', 'CLG936', '4180D', '6626E'] },
  { name: 'SDLG', aliases: ['Lingong'], country: 'CN', kinds: ['excavator', 'loader'], models: ['LG936', 'LG946', 'LG956', 'E6210F', 'B877'] },
  { name: 'Shantui', aliases: ['Шантуй'], country: 'CN', kinds: ['loader', 'road'], models: ['SD16', 'SD22', 'SD32', 'SL50W', 'SG21'] },
  { name: 'Lonking', aliases: ['Лонкинг'], country: 'CN', kinds: ['excavator', 'loader'], models: ['CDM855', 'CDM6225', 'CDM833'] },
  { name: 'Bobcat', aliases: ['Бобкэт'], country: 'US', kinds: ['loader', 'excavator'], models: ['S175', 'S530', 'S650', 'S770', 'T590', 'T770', 'E26', 'E55'] },
  { name: 'Case CE', aliases: ['Case', 'Кейс'], country: 'US', kinds: ['excavator', 'loader'], models: ['580T', '580ST', '695ST', 'SR175', 'SV280', 'CX210', 'CX350', '821G'] },
  { name: 'Kubota', aliases: ['Кубота'], country: 'JP', kinds: ['excavator'], models: ['KX018', 'KX040', 'KX057', 'U27', 'U55'] },
  { name: 'Takeuchi', country: 'JP', kinds: ['excavator', 'loader'], models: ['TB216', 'TB240', 'TB290', 'TL8'] },
  { name: 'Wacker Neuson', aliases: ['Wacker', 'Вакер'], country: 'DE', kinds: ['excavator', 'loader', 'road', 'tool', 'concrete'],
    models: ['EZ17', 'ET65', 'DW60', 'BS 60', 'BS 50-2', 'DPU 6555', 'VP 1550', 'IE 58', 'CT 36'] },
  { name: 'Bauer', aliases: ['Бауэр'], country: 'DE', kinds: ['excavator'], models: ['BG 28', 'BG 36', 'RTG RG 19'] },
  { name: 'Bomag', aliases: ['Бомаг'], country: 'DE', kinds: ['road'], models: ['BW 120', 'BW 177', 'BW 213', 'BW 219', 'BPR 70', 'BT 65', 'BF 300'] },
  { name: 'Hamm', aliases: ['Хамм'], country: 'DE', kinds: ['road'], models: ['HD 12', 'HD+ 110', '3410', '3412', 'H 13i'] },
  { name: 'Dynapac', aliases: ['Динапак'], country: 'SE', kinds: ['road'], models: ['CA2500', 'CA250', 'CC1200', 'CC4200', 'SD2500', 'F1800'] },
  { name: 'Vögele', aliases: ['Vogele', 'Фогеле'], country: 'DE', kinds: ['road'], models: ['Super 1300-3', 'Super 1800-3', 'Super 2100-3'] },
  { name: 'Wirtgen', aliases: ['Виртген'], country: 'DE', kinds: ['road'], models: ['W 50 Ri', 'W 100', 'W 200', 'W 210'] },
  { name: 'Amkodor', aliases: ['Амкодор'], country: 'BY', kinds: ['loader', 'road'], models: ['332', '342', '702', '6622'] },
  { name: 'Chetra', aliases: ['Четра', 'ChTZ', 'ЧТЗ'], country: 'RU', kinds: ['road', 'loader'], models: ['T-11', 'T-25', 'T-40', 'B10M'] },
  // Cranes
  { name: 'Ivanovets', aliases: ['Ивановец'], country: 'RU', kinds: ['crane'], models: ['KS-35714', 'KS-45717', 'KS-55713', 'KS-55744'] },
  { name: 'Galichanin', aliases: ['Галичанин'], country: 'RU', kinds: ['crane'], models: ['KS-55713', 'KS-55729', 'KS-65713'] },
  { name: 'Klintsy', aliases: ['Клинцы', 'Клинцовский'], country: 'RU', kinds: ['crane'], models: ['KS-35719', 'KS-55713-5K', 'KS-45719'] },
  { name: 'Tadano', aliases: ['Тадано'], country: 'JP', kinds: ['crane'], models: ['GR-300EX', 'GR-500EX', 'ATF 70G-4', 'ATF 100G-4'] },
  { name: 'Grove', aliases: ['Manitowoc'], country: 'US', kinds: ['crane'], models: ['GMK3060', 'GMK4100L', 'GMK5250L'] },
  { name: 'Potain', country: 'FR', kinds: ['crane'], models: ['MDT 219', 'MCT 85', 'Igo T 85A'] },
  { name: 'Palfinger', aliases: ['Палфингер'], country: 'AT', kinds: ['crane', 'lift'], models: ['PK 15500', 'PK 23500', 'PK 36502', 'P 480'] },
  { name: 'Fassi', country: 'IT', kinds: ['crane'], models: ['F155A', 'F275A', 'F545RA'] },
  { name: 'Kanglim', aliases: ['Канглим'], country: 'KR', kinds: ['crane'], models: ['KS1056', 'KS2056'] },
  // Concrete
  { name: 'Putzmeister', aliases: ['Путцмайстер'], country: 'DE', kinds: ['concrete'], models: ['M 24', 'M 36', 'M 42', 'M 52', 'BSA 1409', 'BSA 2110', 'SP 11'] },
  { name: 'Schwing', aliases: ['Швинг', 'Stetter'], country: 'DE', kinds: ['concrete'], models: ['S 31XT', 'S 36X', 'S 43SX', 'S 58SX', 'SP 1800'] },
  { name: 'CIFA', country: 'IT', kinds: ['concrete'], models: ['K41L', 'K47H', 'SL9'] },
  // Lifts and handlers
  { name: 'Manitou', aliases: ['Манитоу'], country: 'FR', kinds: ['lift', 'loader'], models: ['MT 625', 'MT 1440', 'MT 1840', 'MRT 2150', '160 ATJ'] },
  { name: 'Genie', aliases: ['Джини'], country: 'US', kinds: ['lift'], models: ['GS-1932', 'GS-2646', 'GS-3246', 'Z-45/25', 'Z-60/37', 'S-65', 'GTH-4014'] },
  { name: 'JLG', country: 'US', kinds: ['lift'], models: ['1930ES', '3246ES', '450AJ', '660SJ', '860SJ'] },
  { name: 'Haulotte', aliases: ['Олот'], country: 'FR', kinds: ['lift'], models: ['Compact 10', 'Compact 12', 'HA16 RTJ', 'HT23 RTJ'] },
  { name: 'Toyota', aliases: ['Toyota Material Handling'], country: 'JP', kinds: ['lift'], models: ['8FD25', '8FG25', '8FD30'] },
  { name: 'Linde', country: 'DE', kinds: ['lift'], models: ['H25', 'H30', 'H50'] },
  // Tools and site power
  { name: 'Bosch', aliases: ['Бош'], country: 'DE', kinds: ['tool'], models: ['GBH 2-26', 'GBH 5-40', 'GSH 11', 'GSH 27', 'GSB 18V-55', 'GWS 22-230', 'GLL 3-80'] },
  { name: 'Makita', aliases: ['Макита'], country: 'JP', kinds: ['tool'], models: ['HR2470', 'HR4013C', 'HM1307', 'HM1812', 'DHP482', 'GA9020', 'EK7651H'] },
  { name: 'DeWalt', aliases: ['ДеВолт'], country: 'US', kinds: ['tool'], models: ['D25133', 'D25614', 'D25899', 'DCD796', 'DWE4257'] },
  { name: 'Hilti', aliases: ['Хилти'], country: 'LI', kinds: ['tool'], models: ['TE 30', 'TE 70', 'TE 1000', 'TE 3000', 'DD 150', 'DD 250', 'DSH 700', 'PR 30'] },
  { name: 'Metabo', aliases: ['Метабо'], country: 'DE', kinds: ['tool'], models: ['KHE 2660', 'MHE 96', 'WE 2200-230'] },
  { name: 'Milwaukee', country: 'US', kinds: ['tool'], models: ['M18 FHX', 'K 900', 'M18 FPD'] },
  { name: 'Interskol', aliases: ['Интерскол'], country: 'RU', kinds: ['tool'], models: ['P-26/800ER', 'P-30/900ER', 'M-29/1500V'] },
  { name: 'Husqvarna', aliases: ['Хускварна'], country: 'SE', kinds: ['tool', 'road'], models: ['K 770', 'K 970', 'FS 400', 'DM 230', 'LF 130'] },
  { name: 'Stihl', aliases: ['Штиль'], country: 'DE', kinds: ['tool'], models: ['TS 420', 'TS 500i', 'TS 800'] },
  { name: 'Lincoln Electric', aliases: ['Lincoln'], country: 'US', kinds: ['tool'], models: ['Invertec V350', 'Ranger 305'] },
  { name: 'ESAB', country: 'SE', kinds: ['tool'], models: ['Buddy Arc 200', 'Rebel EMP 215'] },
  { name: 'Resanta', aliases: ['Ресанта'], country: 'LV', kinds: ['tool', 'power'], models: ['SAI 190', 'SAI 250', 'BM-180'] },
  { name: 'Honda', aliases: ['Хонда'], country: 'JP', kinds: ['power'], models: ['EU22i', 'EM5500', 'EG5500', 'WB30'] },
  { name: 'Atlas Copco', aliases: ['Атлас Копко'], country: 'SE', kinds: ['power', 'tool'], models: ['XAS 97', 'XAS 137', 'XATS 156', 'QAS 60', 'TEX 280'] },
  { name: 'FG Wilson', country: 'GB', kinds: ['power'], models: ['P33-3', 'P110-3', 'P220-3'] },
  { name: 'Huter', aliases: ['Хутер'], country: 'DE', kinds: ['power'], models: ['DY6500L', 'DY8000LX'] },
  { name: 'Fubag', aliases: ['Фубаг'], country: 'DE', kinds: ['power', 'tool'], models: ['BS 6600', 'TI 7000', 'IR 230'] },
  { name: 'Layher', aliases: ['Лайхер'], country: 'DE', kinds: ['tool'], models: ['Allround', 'Blitz'] },
];
