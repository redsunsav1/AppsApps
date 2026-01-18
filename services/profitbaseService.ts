
import { ProjectData, ChessUnit } from '../types';

// --- ТЕСТОВЫЙ РЕЖИМ (ГЕНЕРАТОР) ---
const generateMockUnits = (floors: number, unitsPerFloor: number, prefix: string) => {
  const units: ChessUnit[] = [];
  for (let f = 1; f <= floors; f++) {
    for (let u = 1; u <= unitsPerFloor; u++) {
      const statusRnd = Math.random();
      const status = statusRnd > 0.7 ? 'SOLD' : statusRnd > 0.5 ? 'BOOKED' : 'FREE';
      const rooms = Math.floor(Math.random() * 3) + 1;
      const area = Math.floor(Math.random() * 50) + 35;
      const price = Math.floor(area * 180000); 
      
      const layouts = [
        "https://cdn.planoplan.com/upload/content/2023/07/30/5c3d7c1e-4b8a-4b5a-9b8a-8b8a8b8a8b8a.jpg",
        "https://sk-bui.ru/wp-content/uploads/2020/11/planirovka-1-komnatnoj-kvartiry.jpg",
        "https://arch-shop.ru/wp-content/uploads/2018/12/plan-kvartiri-studii-25-kv-m-pryamougolnaya.jpg"
      ];
      const layout = layouts[Math.floor(Math.random() * layouts.length)];

      units.push({
        id: `${prefix}-${f}-${u}`,
        number: `${f}0${u}`,
        floor: f,
        rooms: rooms,
        area: area,
        price: price,
        status: status as 'FREE' | 'BOOKED' | 'SOLD',
        layoutImage: layout
      });
    }
  }
  return units;
};

export interface ParsedProfitbaseData {
  units: ChessUnit[];
}

/**
 * Fetches units for a specific project.
 * If a URL is provided, it tries to parse XML from there.
 * If not, it generates mock data.
 */
export const fetchProjectUnits = async (project: ProjectData): Promise<ChessUnit[]> => {
  let xmlString = '';

  // 1. Пытаемся загрузить реальные данные по ссылке проекта
  if (project.profitbaseUrl) {
    try {
      const response = await fetch(project.profitbaseUrl);
      if (!response.ok) throw new Error('Network response was not ok');
      xmlString = await response.text();
      // console.log("Loaded XML for", project.name);
    } catch (error) {
      console.warn(`Failed to fetch Profitbase XML for ${project.name}, falling back to Mock data:`, error);
    }
  }

  // 2. Если данных нет или URL пустой — используем Mock
  if (!xmlString) {
    // console.log("Using Mock Data for", project.name);
    await new Promise(resolve => setTimeout(resolve, 300)); // Delay simulation
    return generateMockUnits(project.floors, project.unitsPerFloor, project.id);
  }

  // 3. Парсинг XML
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");
  const units: ChessUnit[] = [];

  // Try to find units. Structure might vary: <unit> or <offer>
  // Assuming standard Profitbase/Yandex format where list is flat or nested in project
  const unitNodes = xmlDoc.getElementsByTagName("unit"); // profitbase usually uses <unit> or <offer> in yandex format

  for (let j = 0; j < unitNodes.length; j++) {
      const uNode = unitNodes[j];
      
      // Basic extraction logic - adjust based on exact XML format
      const id = uNode.getAttribute("id") || `u${j}`;
      const number = uNode.getElementsByTagName("number")[0]?.textContent || uNode.getAttribute("number") || "0";
      const floor = parseInt(uNode.getElementsByTagName("floor")[0]?.textContent || "1");
      const rooms = parseInt(uNode.getElementsByTagName("rooms")[0]?.textContent || "1");
      const area = parseFloat(uNode.getElementsByTagName("area")[0]?.textContent || "0");
      const price = parseInt(uNode.getElementsByTagName("price")[0]?.textContent || uNode.getElementsByTagName("price")[0]?.getElementsByTagName("value")[0]?.textContent || "0");
      
      // Status mapping might differ
      const statusRaw = uNode.getElementsByTagName("status")[0]?.textContent || "AVAILABLE"; 
      let status: 'FREE' | 'BOOKED' | 'SOLD' = 'FREE';
      if(statusRaw.toUpperCase().includes('SOLD')) status = 'SOLD';
      if(statusRaw.toUpperCase().includes('BOOKED') || statusRaw.toUpperCase().includes('RESERVED')) status = 'BOOKED';

      const layoutImage = uNode.getElementsByTagName("layout_image")[0]?.textContent || uNode.getElementsByTagName("image")[0]?.textContent || "";

      units.push({
        id,
        number,
        floor,
        rooms,
        area,
        price,
        status,
        layoutImage
      });
  }
  
  // Sort bottom-up
  units.sort((a, b) => {
      if (b.floor !== a.floor) return b.floor - a.floor;
      return a.number.localeCompare(b.number);
  });

  // If XML parsed but yielded 0 units (maybe wrong format), fallback
  if (units.length === 0) {
      return generateMockUnits(project.floors, project.unitsPerFloor, project.id);
  }

  return units;
};
