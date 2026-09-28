// 권역별 이름 풀 (가상 이름, 스펙 Q6: 실존 선수 라이선스 회피)
export const NAME_POOLS = {
  europe: {
    first: [
      'Marco', 'Luca', 'Erik', 'Hugo', 'Felix', 'Ivan', 'Milan', 'Antoine',
      'Stefan', 'Pavel', 'Jonas', 'Mateusz', 'Nils', 'Adrian', 'Viktor', 'Tomas',
      'Emil', 'Aleksander', 'Bruno', 'Dario', 'Kristjan', 'Marek', 'Oskar', 'Rudi',
      'Lukas', 'Henrik', 'Damir', 'Goran', 'Matteo', 'Sven', 'Filip', 'Andrei',
      'Tobias', 'Karel', 'Dominik', 'Radu', 'Anton', 'Werner', 'Gregor', 'Nino',
    ],
    last: [
      'Rossi', 'Nagy', 'Berg', 'Dubois', 'Keller', 'Novak', 'Petrov', 'Laurent',
      'Kowalski', 'Andersen', 'Moretti', 'Horvat', 'Schneider', 'Vidal', 'Lindqvist', 'Kovacs',
      'Marchetti', 'Bauer', 'Tomic', 'Sorensen', 'Pavlov', 'Weber', 'Duarte', 'Ferreira',
      'Meier', 'Wagner', 'Novotny', 'Lukic', 'Zeman', 'Hoffmann', 'Vasiliev', 'Berger',
      'Krause', 'Milic', 'Stoica', 'Halvorsen', 'Jankovic', 'Ricci', 'Blazek', 'Sandberg',
    ],
  },
  southAmerica: {
    first: [
      'Diego', 'Mateus', 'Santiago', 'Rafael', 'Gustavo', 'Thiago', 'Emiliano', 'Bruno',
      'Nicolas', 'Joaquin', 'Rodrigo', 'Leandro', 'Agustin', 'Fabricio', 'Ricardo', 'Sebastian',
      'Facundo', 'Renato', 'Cristian', 'Ezequiel', 'Vinicius', 'Alexis', 'Martin', 'Ignacio',
      'Matias', 'Lucas', 'Bernardo', 'Franco', 'Gonzalo', 'Andre', 'Nahuel', 'Esteban',
      'Danilo', 'Junior', 'Maximiliano', 'Rogerio', 'Cesar', 'Pablo', 'Wagner', 'Tomas',
    ],
    last: [
      'Silva', 'Fernandez', 'Rojas', 'Almeida', 'Vidal', 'Souza', 'Diaz', 'Correa',
      'Pereira', 'Ibarra', 'Cabrera', 'Moraes', 'Contreras', 'Reyes', 'Barrios', 'Aguirre',
      'Salinas', 'Carvalho', 'Espinoza', 'Ortega', 'Nunes', 'Lezcano', 'Bustos', 'Machado',
      'Ramos', 'Paredes', 'Gimenez', 'Rivas', 'Santana', 'Cardozo', 'Bermudez', 'Herrera',
      'Villalba', 'Peralta', 'Sosa', 'Benitez', 'Godoy', 'Acosta', 'Medina', 'Franco',
    ],
  },
  africa: {
    first: [
      'Kwame', 'Amara', 'Sipho', 'Chidi', 'Tunde', 'Baraka', 'Kofi', 'Femi',
      'Emeka', 'Jabari', 'Lamin', 'Moussa', 'Yaw', 'Kwabena', 'Thabo', 'Obinna',
      'Ismail', 'Bakary', 'Zola', 'Amani', 'Kayode', 'Diakite', 'Ousmane', 'Sekou',
      'Ayodele', 'Mamadou', 'Nnamdi', 'Kabir', 'Themba', 'Zuberi', 'Idris', 'Abdulai',
      'Chibueze', 'Lassana', 'Godfrey', 'Olumide', 'Yusuf', 'Kwesi', 'Ibrahima', 'Solomon',
    ],
    last: [
      'Okafor', 'Diallo', 'Mwangi', 'Traore', 'Adeyemi', 'Osei', 'Keita', 'Camara',
      'Kone', 'Mensah', 'Abara', 'Nwosu', 'Toure', 'Cisse', 'Bello', 'Onyango',
      'Sylla', 'Ndiaye', 'Kamau', 'Fofana', 'Balogun', 'Coulibaly', 'Owusu', 'Simba',
      'Achebe', 'Diarra', 'Kabore', 'Mutua', 'Odhiambo', 'Bangura', 'Konate', 'Adisa',
      'Otieno', 'Mbeki', 'Sanogo', 'Kargbo', 'Ilunga', 'Were', 'Njoroge', 'Sacko',
    ],
  },
  asiaOceania: {
    first: [
      'Haruto', 'Minjun', 'Wei', 'Arjun', 'Kenji', 'Taehyun', 'Ravi', 'Liam',
      'Sota', 'Junho', 'Lei', 'Vikram', 'Ryo', 'Seojun', 'Jian', 'Rohan',
      'Kaito', 'Donghyun', 'Feng', 'Aditya', 'Hayden', 'Yifan', 'Daichi', 'Hyunwoo',
      'Haruki', 'Jiwon', 'Xin', 'Aarav', 'Sanjay', 'Minho', 'Takeshi', 'Cheng',
      'Dev', 'Yuto', 'Woojin', 'Anand', 'Kohei', 'Siddharth', 'Jaesung', 'Long',
    ],
    last: [
      'Tanaka', 'Kim', 'Zhang', 'Sharma', 'Nakamura', 'Park', 'Patel', 'Wong',
      'Suzuki', 'Lee', 'Wang', 'Gupta', 'Yamamoto', 'Choi', 'Liu', 'Singh',
      'Kobayashi', 'Jung', 'Chen', 'Reddy', 'Watanabe', 'Yoon', 'Huang', 'Nair',
      'Saito', 'Han', 'Xu', 'Verma', 'Ito', 'Cho', 'Malhotra', 'Zhao',
      'Inoue', 'Yang', 'Rao', 'Kato', 'Song', 'Iyer', 'Fujita', 'Ma',
    ],
  },
  northCentralAmerica: {
    first: [
      'Carlos', 'Jordan', 'Miguel', 'Tyler', 'Andres', 'Kevin', 'Marcus', 'Ethan',
      'Diego', 'Brandon', 'Luis', 'Cody', 'Alejandro', 'Trevor', 'Julio', 'Dylan',
      'Hector', 'Austin', 'Ricardo', 'Connor', 'Sergio', 'Mason', 'Emilio', 'Wyatt',
      'Nathan', 'Oscar', 'Isaac', 'Derek', 'Manuel', 'Jeremy', 'Fernando', 'Colton',
      'Bryan', 'Enrique', 'Chase', 'Tristan', 'Gabriel', 'Spencer', 'Rene', 'Marco',
    ],
    last: [
      'Hernandez', 'Johnson', 'Ramirez', 'Smith', 'Gomez', 'Brown', 'Flores', 'Davis',
      'Martinez', 'Wilson', 'Torres', 'Anderson', 'Vega', 'Clark', 'Cortez', 'Mitchell',
      'Aguilar', 'Turner', 'Delgado', 'Parker', 'Cervantes', 'Foster', 'Salazar', 'Bennett',
      'Gonzales', 'Castillo', 'Ward', 'Navarro', 'Barrett', 'Escobar', 'Griffin', 'Maldonado',
      'Sanders', 'Rivera', 'Coleman', 'Robles', 'Stewart', 'Mora', 'Bravo', 'Lozano',
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
