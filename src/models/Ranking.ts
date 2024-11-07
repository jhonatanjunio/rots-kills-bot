interface PlayerKDA {
    name: string;
    kills: number;
    deaths: number;
    assists: number;
    kda: number;
}

interface RankingOptions {
    startDate: number | null;
    endDate: number;
}

export { PlayerKDA, RankingOptions };