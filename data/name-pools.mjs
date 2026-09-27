// 권역별 이름 풀 (가상 이름, 스펙 Q6: 실존 선수 라이선스 회피)
export const NAME_POOLS = {
  europe: {
    first: [
      'Marco', 'Luca', 'Erik', 'Hugo', 'Felix', 'Ivan', 'Milan', 'Antoine',
      'Stefan', 'Pavel', 'Jonas', 'Mateusz', 'Nils', 'Adrian', 'Viktor', 'Tomas',
      'Emil', 'Aleksander', 'Bruno', 'Dario', 'Kristjan', 'Marek', 'Oskar', 'Rudi',
    ],
    last: [
      'Rossi', 'Nagy', 'Berg', 'Dubois', 'Keller', 'Novak', 'Petrov', 'Laurent',
      'Kowalski', 'Andersen', 'Moretti', 'Horvat', 'Schneider', 'Vidal', 'Lindqvist', 'Kovacs',
      'Marchetti', 'Bauer', 'Tomic', 'Sorensen', 'Pavlov', 'Weber', 'Duarte', 'Ferreira',
    ],
  },
  southAmerica: {
    first: [
      'Diego', 'Mateus', 'Santiago', 'Rafael', 'Gustavo', 'Thiago', 'Emiliano', 'Bruno',
      'Nicolas', 'Joaquin', 'Rodrigo', 'Leandro', 'Agustin', 'Fabricio', 'Ricardo', 'Sebastian',
      'Facundo', 'Renato', 'Cristian', 'Ezequiel', 'Vinicius', 'Alexis', 'Martin', 'Ignacio',
    ],
    last: [
      'Silva', 'Fernandez', 'Rojas', 'Almeida', 'Vidal', 'Souza', 'Diaz', 'Correa',
      'Pereira', 'Ibarra', 'Cabrera', 'Moraes', 'Contreras', 'Reyes', 'Barrios', 'Aguirre',
      'Salinas', 'Carvalho', 'Espinoza', 'Ortega', 'Nunes', 'Lezcano', 'Bustos', 'Machado',
    ],
  },
  africa: {
    first: [
      'Kwame', 'Amara', 'Sipho', 'Chidi', 'Tunde', 'Baraka', 'Kofi', 'Femi',
      'Emeka', 'Jabari', 'Lamin', 'Moussa', 'Yaw', 'Kwabena', 'Thabo', 'Obinna',
      'Ismail', 'Bakary', 'Zola', 'Amani', 'Kayode', 'Diakite', 'Ousmane', 'Sekou',
    ],
    last: [
      'Okafor', 'Diallo', 'Mwangi', 'Traore', 'Adeyemi', 'Osei', 'Keita', 'Camara',
      'Kone', 'Mensah', 'Abara', 'Nwosu', 'Toure', 'Cisse', 'Bello', 'Onyango',
      'Sylla', 'Ndiaye', 'Kamau', 'Fofana', 'Balogun', 'Coulibaly', 'Owusu', 'Simba',
    ],
  },
  asiaOceania: {
    first: [
      'Haruto', 'Minjun', 'Wei', 'Arjun', 'Kenji', 'Taehyun', 'Ravi', 'Liam',
      'Sota', 'Junho', 'Lei', 'Vikram', 'Ryo', 'Seojun', 'Jian', 'Rohan',
      'Kaito', 'Donghyun', 'Feng', 'Aditya', 'Hayden', 'Yifan', 'Daichi', 'Hyunwoo',
    ],
    last: [
      'Tanaka', 'Kim', 'Zhang', 'Sharma', 'Nakamura', 'Park', 'Patel', 'Wong',
      'Suzuki', 'Lee', 'Wang', 'Gupta', 'Yamamoto', 'Choi', 'Liu', 'Singh',
      'Kobayashi', 'Jung', 'Chen', 'Reddy', 'Watanabe', 'Yoon', 'Huang', 'Nair',
    ],
  },
  northCentralAmerica: {
    first: [
      'Carlos', 'Jordan', 'Miguel', 'Tyler', 'Andres', 'Kevin', 'Marcus', 'Ethan',
      'Diego', 'Brandon', 'Luis', 'Cody', 'Alejandro', 'Trevor', 'Julio', 'Dylan',
      'Hector', 'Austin', 'Ricardo', 'Connor', 'Sergio', 'Mason', 'Emilio', 'Wyatt',
    ],
    last: [
      'Hernandez', 'Johnson', 'Ramirez', 'Smith', 'Gomez', 'Brown', 'Flores', 'Davis',
      'Martinez', 'Wilson', 'Torres', 'Anderson', 'Vega', 'Clark', 'Cortez', 'Mitchell',
      'Aguilar', 'Turner', 'Delgado', 'Parker', 'Cervantes', 'Foster', 'Salazar', 'Bennett',
    ],
  },
};

export function pick(array, rng) {
  return array[Math.floor(rng() * array.length)];
}

export function randomName(continentTag, rng) {
  const pool = NAME_POOLS[continentTag];
  return `${pick(pool.first, rng)} ${pick(pool.last, rng)}`;
}
