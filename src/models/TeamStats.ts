export interface PlayerStats {
    name: string;
    kills: number;
    deaths: number;
    assists: number;
    kda: number;
}

export interface TeamStats {
    players: PlayerStats[];
    totalKills: number;
    totalDeaths: number;
    totalAssists: number;
    averageKDA: number;
}