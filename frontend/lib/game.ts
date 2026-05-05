import type { TurnResolution, CombatResult } from "./mxe-types";

export interface Territory {
  id: number;
  owner: string | null; // playerId or null for neutral
  units: number;
}

export interface GameBoard {
  territories: Territory[];
  playerIds: [string, string];
}

const GRID_SIZE = 5;
const TOTAL_TERRITORIES = GRID_SIZE * GRID_SIZE; // 25

// Player one starts with 0,1,2 | Player two starts with 22,23,24 (opposite corners)
const P1_START = [0, 1, 2];
const P2_START = [22, 23, 24];
const STARTING_UNITS = 5;

export function initializeBoard(
  playerOneId: string,
  playerTwoId: string
): GameBoard {
  const territories: Territory[] = Array.from(
    { length: TOTAL_TERRITORIES },
    (_, i) => ({
      id: i,
      owner: P1_START.includes(i)
        ? playerOneId
        : P2_START.includes(i)
        ? playerTwoId
        : null,
      units: P1_START.includes(i) || P2_START.includes(i) ? STARTING_UNITS : 0,
    })
  );

  return { territories, playerIds: [playerOneId, playerTwoId] };
}

export function getAdjacentTerritories(territory: number): number[] {
  const row = Math.floor(territory / GRID_SIZE);
  const col = territory % GRID_SIZE;
  const adjacent: number[] = [];

  if (row > 0) adjacent.push((row - 1) * GRID_SIZE + col); // up
  if (row < GRID_SIZE - 1) adjacent.push((row + 1) * GRID_SIZE + col); // down
  if (col > 0) adjacent.push(row * GRID_SIZE + (col - 1)); // left
  if (col < GRID_SIZE - 1) adjacent.push(row * GRID_SIZE + (col + 1)); // right

  return adjacent;
}

export function applyResolution(
  board: GameBoard,
  resolution: TurnResolution
): GameBoard {
  const next: GameBoard = {
    ...board,
    territories: board.territories.map((t) => ({ ...t })),
  };

  for (const result of resolution.combatResults) {
    if (result.territoryChanged >= 0) {
      const terr = next.territories[result.territoryChanged];
      // Transfer ownership to winner
      const winnerCounts = result.newUnitCounts[result.winner];
      // Find the territory index in the winner's list — we use sum as approximation
      // since exact territory ordering is internal to MXE
      const survivingUnits =
        winnerCounts && winnerCounts.length > 0
          ? winnerCounts[winnerCounts.length - 1]
          : 1;

      terr.owner = result.winner;
      terr.units = Math.max(1, survivingUnits);
    }

    // Update defender's territory unit count
    const defenderCounts = result.newUnitCounts[result.loser];
    if (defenderCounts) {
      let idx = 0;
      for (const t of next.territories) {
        if (t.owner === result.loser && idx < defenderCounts.length) {
          t.units = defenderCounts[idx];
          idx++;
        }
      }
    }
  }

  return next;
}

export function checkWinCondition(board: GameBoard): string | null {
  const [p1, p2] = board.playerIds;

  const p1Units = board.territories
    .filter((t) => t.owner === p1)
    .reduce((sum, t) => sum + t.units, 0);

  const p2Units = board.territories
    .filter((t) => t.owner === p2)
    .reduce((sum, t) => sum + t.units, 0);

  const p1Territories = board.territories.filter((t) => t.owner === p1).length;
  const p2Territories = board.territories.filter((t) => t.owner === p2).length;

  if (p1Units <= 0 || p1Territories === 0) return p2;
  if (p2Units <= 0 || p2Territories === 0) return p1;
  if (p1Territories >= TOTAL_TERRITORIES) return p1;
  if (p2Territories >= TOTAL_TERRITORIES) return p2;

  return null;
}

export function isValidMove(
  board: GameBoard,
  from: number,
  to: number,
  units: number,
  playerId: string
): boolean {
  if (from < 0 || from >= TOTAL_TERRITORIES) return false;
  if (to < 0 || to >= TOTAL_TERRITORIES) return false;
  if (from === to) return false;

  const fromTerr = board.territories[from];
  if (!fromTerr || fromTerr.owner !== playerId) return false;
  if (units <= 0 || units > fromTerr.units) return false;

  const adjacent = getAdjacentTerritories(from);
  if (!adjacent.includes(to)) return false;

  return true;
}
