/* ============================================================
   THE BACKROOMS — layouts desenhados à mão
   ------------------------------------------------------------
   Grades fixas (1 célula = 1,2 m) para lugares que precisam de
   uma planta específica, no lugar do gerador aleatório:
     * office    — o escritório do prólogo (com banheiro)
     * introHall — o salão do Nível 0 visto no fim da abertura
   Cada função devolve { grid, start, zones }.
   ============================================================ */
(function (BR) {
  'use strict';

  function makeGrid(N) {
    const g = new Uint8Array(N * N).fill(1);
    return {
      g,
      carve(x0, z0, x1, z1) { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (x > 0 && z > 0 && x < N - 1 && z < N - 1) g[z * N + x] = 0; },
      wall(x0, z0, x1, z1) { for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) g[z * N + x] = 1; },
    };
  }

  const L = (BR.Layouts = {});

  // ---------------- escritório do prólogo (N = 34) ----------------
  L.office = function (N) {
    const m = makeGrid(N);
    m.carve(1, 1, 21, 17);               // salão de baias
    for (const [x, z] of [[8, 6], [14, 6], [8, 12], [14, 12]]) m.wall(x, z, x, z); // pilares
    m.carve(22, 7, 32, 9);               // corredor
    m.carve(25, 11, 32, 16);             // banheiro
    m.carve(26, 10, 27, 10);             // porta do banheiro
    m.carve(24, 1, 32, 5);               // copa
    m.carve(29, 6, 30, 6);               // porta da copa
    const zones = {
      office: [1, 1, 21, 17], corridor: [22, 7, 32, 9], restroom: [25, 11, 32, 16], kitchen: [24, 1, 32, 5],
    };
    return { grid: m.g, start: 16 * N + 4, zones };
  };

  // ---------------- salão do fim da abertura (N = 40) ----------------
  L.introHall = function (N) {
    const m = makeGrid(N);
    m.carve(14, 3, 23, 37);                       // salão principal (comprido, ~10 m de largura)
    for (let z = 7; z <= 33; z += 4) { m.wall(16, z, 16, z); m.wall(21, z, 21, z); } // duas fileiras de pilares
    m.carve(3, 6, 12, 15); m.carve(13, 9, 13, 11);  // sala à esquerda + vão
    m.wall(7, 9, 7, 12);                            // parede solta
    m.carve(4, 19, 12, 30); m.carve(13, 22, 13, 24); m.carve(13, 27, 13, 27);
    m.wall(8, 21, 10, 21); m.wall(6, 25, 6, 28);
    m.carve(25, 8, 35, 18); m.carve(24, 12, 24, 14);
    m.wall(29, 11, 29, 15);
    m.carve(25, 23, 36, 33); m.carve(24, 26, 24, 27); m.carve(24, 31, 24, 31);
    m.wall(30, 26, 33, 26);
    m.carve(1, 33, 13, 34); m.carve(24, 3, 36, 4);  // corredores que somem na névoa
    m.carve(18, 1, 19, 2);
    return { grid: m.g, start: 35 * N + 19, zones: {} };
  };
})(window.BR);
