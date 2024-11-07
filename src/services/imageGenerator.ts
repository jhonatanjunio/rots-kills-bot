import satori from 'satori';
import sharp from 'sharp';
import { TeamStats } from '../models/TeamStats';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PlayerKDA } from '../models/Ranking';

export class ImageGenerator {
    private static readonly PLAYERS_PER_PAGE = 15;
    
    private static async loadFonts() {
        return {
            regular: await readFileSync(join(__dirname, '../../assets/fonts/Inter-Medium.ttf')),
            bold: await readFileSync(join(__dirname, '../../assets/fonts/Inter-Bold.ttf')),
        };
    }

    static async generateWarStats(
        period: string,
        allyStats: TeamStats,
        enemyStats: TeamStats,
        page: number = 1
    ): Promise<{ buffer: Buffer; totalPages: number }> {
        const fonts = await this.loadFonts();

        // Calcula o total de páginas baseado no maior número de jogadores
        const maxPlayers = Math.max(allyStats.players.length, enemyStats.players.length);
        const totalPages = Math.ceil(maxPlayers / this.PLAYERS_PER_PAGE);

        // Pagina os jogadores se necessário
        const startIndex = (page - 1) * this.PLAYERS_PER_PAGE;
        const endIndex = startIndex + this.PLAYERS_PER_PAGE;

        const paginatedAllyStats = {
            ...allyStats,
            players: allyStats.players.slice(startIndex, endIndex)
        };

        const paginatedEnemyStats = {
            ...enemyStats,
            players: enemyStats.players.slice(startIndex, endIndex)
        };

        // Constantes para cálculo de altura
        const HEADER_HEIGHT = 80; // Título principal
        const TEAM_HEADER_HEIGHT = 50; // Cabeçalho de cada time
        const ROW_HEIGHT = 40; // Altura de cada linha de jogador
        const FOOTER_HEIGHT = 50; // Rodapé com totais
        const PADDING = 40; // Padding total (topo + baixo)

        // Calcula a altura necessária baseada no número de jogadores da página atual
        const pagePlayersCount = Math.max(
            paginatedAllyStats.players.length,
            paginatedEnemyStats.players.length
        );
        const contentHeight = HEADER_HEIGHT + 
                            TEAM_HEADER_HEIGHT + 
                            (ROW_HEIGHT * pagePlayersCount) + 
                            FOOTER_HEIGHT + 
                            PADDING;

        // Cores mais suaves
        const COLORS = {
            ALLY: '#4ade80',  // Verde mais suave
            ENEMY: '#f87171', // Vermelho mais suave
            TEXT: '#FFFFFF',
            BACKGROUND: '#2F3136',
            SECONDARY_BG: '#36393F',
            BORDER: '#4F545C',
            SUBTEXT: '#B9BBBE'
        };

        const html = {
            type: 'div',
            props: {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '20px',
                    width: '1024px',
                    height: `${contentHeight}px`,
                    backgroundColor: COLORS.BACKGROUND,
                    color: COLORS.TEXT,
                    fontFamily: 'Inter'
                },
                children: [
                    {
                        type: 'div',
                        props: {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '24px',
                                marginBottom: '20px',
                                color: COLORS.TEXT,
                                fontWeight: 'bold'
                            },
                            children: [`Estatísticas de Guerra - ${period}`]
                        }
                    },
                    {
                        type: 'div',
                        props: {
                            style: {
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: '20px'
                            },
                            children: [
                                // No Fear to Kill Stats
                                this.createTeamSection('No Fear to Kill', paginatedAllyStats, COLORS.ALLY),
                                // Divisor
                                {
                                    type: 'div',
                                    props: {
                                        style: {
                                            width: '2px',
                                            backgroundColor: COLORS.BORDER
                                        }
                                    }
                                },
                                // Enemy Stats
                                this.createTeamSection('Inimigos', paginatedEnemyStats, COLORS.ENEMY)
                            ]
                        }
                    }
                ]
            }
        };

        const svg = await satori(html, {
            width: 1024,
            height: contentHeight,
            fonts: [
                {
                    name: 'Inter',
                    data: fonts.regular,
                    weight: 400,
                    style: 'normal'
                },
                {
                    name: 'Inter',
                    data: fonts.bold,
                    weight: 700,
                    style: 'normal'
                }
            ]
        });

        return {
            buffer: await sharp(Buffer.from(svg)).png().toBuffer(),
            totalPages: maxPlayers > this.PLAYERS_PER_PAGE ? totalPages : 1
        };
    }

    private static createTeamSection(
        title: string,
        stats: TeamStats,
        color: string
    ) {
        return {
            type: 'div',
            props: {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    flex: 1,
                    backgroundColor: '#36393F',
                    borderRadius: '8px',
                    padding: '15px'
                },
                children: [
                    {
                        type: 'div',
                        props: {
                            style: {
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '20px',
                                color,
                                marginBottom: '15px',
                                fontWeight: 'bold'
                            },
                            children: [title]
                        }
                    },
                    // Header
                    {
                        type: 'div',
                        props: {
                            style: {
                                display: 'flex',
                                padding: '8px',
                                backgroundColor: '#2F3136',
                                borderRadius: '4px',
                                marginBottom: '10px'
                            },
                            children: [
                                {
                                    type: 'div',
                                    props: {
                                        style: {
                                            flex: '2',
                                            color: '#B9BBBE',
                                            fontSize: '14px'
                                        },
                                        children: 'Jogador'
                                    }
                                },
                                ...['K', 'D', 'A', 'KDA'].map(text => ({
                                    type: 'div',
                                    props: {
                                        style: {
                                            flex: '1',
                                            color: '#B9BBBE',
                                            fontSize: '14px',
                                            textAlign: 'center'
                                        },
                                        children: text
                                    }
                                }))
                            ]
                        }
                    },
                    // Player Rows Container
                    {
                        type: 'div',
                        props: {
                            style: {
                                display: 'flex',
                                flexDirection: 'column'
                            },
                            children: stats.players.map(player => ({
                                type: 'div',
                                props: {
                                    style: {
                                        display: 'flex',
                                        padding: '8px',
                                        borderBottom: '1px solid #4F545C'
                                    },
                                    children: [
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    flex: '2',
                                                    fontSize: '14px'
                                                },
                                                children: player.name
                                            }
                                        },
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    flex: '1',
                                                    textAlign: 'center',
                                                    fontSize: '14px'
                                                },
                                                children: player.kills.toString()
                                            }
                                        },
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    flex: '1',
                                                    textAlign: 'center',
                                                    fontSize: '14px'
                                                },
                                                children: player.deaths.toString()
                                            }
                                        },
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    flex: '1',
                                                    textAlign: 'center',
                                                    fontSize: '14px'
                                                },
                                                children: player.assists.toString()
                                            }
                                        },
                                        {
                                            type: 'div',
                                            props: {
                                                style: {
                                                    flex: '1',
                                                    textAlign: 'center',
                                                    fontSize: '14px'
                                                },
                                                children: player.kda.toFixed(2)
                                            }
                                        }
                                    ]
                                }
                            }))
                        }
                    },
                    // Totals
                    {
                        type: 'div',
                        props: {
                            style: {
                                display: 'flex',
                                padding: '8px',
                                marginTop: '10px',
                                backgroundColor: '#2F3136',
                                borderRadius: '4px'
                            },
                            children: [
                                {
                                    type: 'div',
                                    props: {
                                        style: {
                                            flex: '2',
                                            fontWeight: 'bold',
                                            fontSize: '14px'
                                        },
                                        children: 'Total'
                                    }
                                },
                                {
                                    type: 'div',
                                    props: {
                                        style: {
                                            flex: '1',
                                            textAlign: 'center',
                                            fontWeight: 'bold',
                                            fontSize: '14px'
                                        },
                                        children: stats.totalKills.toString()
                                    }
                                },
                                {
                                    type: 'div',
                                    props: {
                                        style: {
                                            flex: '1',
                                            textAlign: 'center',
                                            fontWeight: 'bold',
                                            fontSize: '14px'
                                        },
                                        children: stats.totalDeaths.toString()
                                    }
                                },
                                {
                                    type: 'div',
                                    props: {
                                        style: {
                                            flex: '1',
                                            textAlign: 'center',
                                            fontWeight: 'bold',
                                            fontSize: '14px'
                                        },
                                        children: stats.totalAssists.toString()
                                    }
                                },
                                {
                                    type: 'div',
                                    props: {
                                        style: {
                                            flex: '1',
                                            textAlign: 'center',
                                            fontWeight: 'bold',
                                            fontSize: '14px'
                                        },
                                        children: stats.averageKDA.toFixed(2)
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        };
    }

    static async generateRankingStats(
        period: string,
        playerStats: PlayerKDA[],
        page: number = 1
    ): Promise<{ buffer: Buffer; totalPages: number }> {
        const fonts = await this.loadFonts();

        // Calcula o total de páginas
        const totalPages = Math.ceil(playerStats.length / this.PLAYERS_PER_PAGE);

        // Pagina os jogadores
        const startIndex = (page - 1) * this.PLAYERS_PER_PAGE;
        const endIndex = startIndex + this.PLAYERS_PER_PAGE;
        const paginatedStats = playerStats.slice(startIndex, endIndex);

        // Altura fixa para 15 jogadores
        const HEADER_HEIGHT = 80;
        const TABLE_HEADER_HEIGHT = 50;
        const ROW_HEIGHT = 40;
        const PADDING = 40;
        const contentHeight = HEADER_HEIGHT + 
                            TABLE_HEADER_HEIGHT + 
                            (ROW_HEIGHT * Math.min(this.PLAYERS_PER_PAGE, paginatedStats.length)) + 
                            PADDING;

        const COLORS = {
            TEXT: '#FFFFFF',
            BACKGROUND: '#2F3136',
            SECONDARY_BG: '#36393F',
            BORDER: '#4F545C',
            SUBTEXT: '#B9BBBE',
            GOLD: '#FFD700',
            SILVER: '#C0C0C0',
            BRONZE: '#CD7F32',
            ROW_BG_1: '#2b2d31',  // Fundo mais escuro para primeiro lugar
            ROW_BG_2: '#2b2d31',  // Fundo mais escuro para segundo lugar
            ROW_BG_3: '#2b2d31',  // Fundo mais escuro para terceiro lugar
        };

        const html = {
            type: 'div',
            props: {
                style: {
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '20px',
                    width: '1024px',
                    height: `${contentHeight}px`,
                    backgroundColor: COLORS.BACKGROUND,
                    color: COLORS.TEXT,
                    fontFamily: 'Inter'
                },
                children: [
                    // Container principal da tabela
                    {
                        type: 'div',
                        props: {
                            style: {
                                display: 'flex',
                                flexDirection: 'column',
                                flex: 1
                            },
                            children: [
                                // Título
                                {
                                    type: 'div',
                                    props: {
                                        style: {
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '24px',
                                            marginBottom: '20px',
                                            color: COLORS.TEXT,
                                            fontWeight: 'bold'
                                        },
                                        children: [`Ranking de Guerreiros - ${period}`]
                                    }
                                },
                                // Container da tabela
                                {
                                    type: 'div',
                                    props: {
                                        style: {
                                            display: 'flex',
                                            flexDirection: 'column',
                                            backgroundColor: COLORS.SECONDARY_BG,
                                            borderRadius: '8px',
                                            padding: '15px'
                                        },
                                        children: [
                                            this.createRankingHeader(),
                                            ...paginatedStats.map((player, index) => 
                                                this.createRankingRow(player, startIndex + index + 1)
                                            )
                                        ]
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        };

        const svg = await satori(html, {
            width: 1024,
            height: contentHeight,
            fonts: [
                {
                    name: 'Inter',
                    data: fonts.regular,
                    weight: 400,
                    style: 'normal'
                },
                {
                    name: 'Inter',
                    data: fonts.bold,
                    weight: 700,
                    style: 'normal'
                }
            ]
        });

        return {
            buffer: await sharp(Buffer.from(svg)).png().toBuffer(),
            totalPages: totalPages
        };
    }

    private static createRankingHeader() {
        return {
            type: 'div',
            props: {
                style: {
                    display: 'flex',
                    padding: '8px',
                    backgroundColor: '#2F3136',
                    borderRadius: '4px',
                    marginBottom: '10px'
                },
                children: [
                    {
                        type: 'div',
                        props: {
                            style: {
                                display: 'flex',
                                flex: '1',
                                justifyContent: 'center',
                                color: '#B9BBBE',
                                fontSize: '14px'
                            },
                            children: ['Pos']
                        }
                    },
                    {
                        type: 'div',
                        props: {
                            style: {
                                display: 'flex',
                                flex: '3',
                                color: '#B9BBBE',
                                fontSize: '14px'
                            },
                            children: ['Jogador']
                        }
                    },
                    ...['K', 'D', 'A', 'KDA'].map(text => ({
                        type: 'div',
                        props: {
                            style: {
                                display: 'flex',
                                flex: '1',
                                justifyContent: 'center',
                                color: '#B9BBBE',
                                fontSize: '14px'
                            },
                            children: [text]
                        }
                    }))
                ]
            }
        };
    }

    private static createRankingRow(player: PlayerKDA, position: number) {

        const MEDALS = {
            FIRST: 'https://images.emojiterra.com/google/noto-emoji/unicode-16.0/color/svg/1f947.svg',  // Substitua com URLs reais
            SECOND: 'https://images.emojiterra.com/google/noto-emoji/unicode-16.0/color/svg/1f948.svg', // das imagens que você
            THIRD: 'https://images.emojiterra.com/google/noto-emoji/unicode-16.0/color/svg/1f949.svg'   // vai usar
        };

        const POSITION_STYLES = {
            1: {
                color: '#FFD700',
                background: '#2b2d31',
                image: MEDALS.FIRST
            },
            2: {
                color: '#C0C0C0',
                background: '#2b2d31',
                image: MEDALS.SECOND
            },
            3: {
                color: '#CD7F32',
                background: '#2b2d31',
                image: MEDALS.THIRD
            }
        };

        const style = POSITION_STYLES[position as keyof typeof POSITION_STYLES];

        return {
            type: 'div',
            props: {
                style: {
                    display: 'flex',
                    padding: '8px',
                    borderBottom: '1px solid #4F545C',
                    backgroundColor: style ? style.background : 'transparent'
                },
                children: [
                    {
                        type: 'div',
                        props: {
                            style: {
                                display: 'flex',
                                flex: '1',
                                justifyContent: 'center',
                                alignItems: 'center'
                            },
                            children: [position <= 3 ? {
                                type: 'img',
                                props: {
                                    src: style?.image,
                                    width: 20,
                                    height: 20
                                }
                            } : position.toString()]
                        }
                    },
                    {
                        type: 'div',
                        props: {
                            style: {
                                display: 'flex',
                                flex: '3',
                                fontSize: '14px',
                                color: style ? style.color : '#FFFFFF'
                            },
                            children: [player.name]
                        }
                    },
                    ...['kills', 'deaths', 'assists', 'kda'].map(stat => ({
                        type: 'div',
                        props: {
                            style: {
                                display: 'flex',
                                flex: '1',
                                justifyContent: 'center',
                                fontSize: '14px',
                                color: '#FFFFFF'
                            },
                            children: [
                                stat === 'kda' ? 
                                    Number(player[stat as keyof PlayerKDA]).toFixed(2) : 
                                    player[stat as keyof PlayerKDA].toString()
                            ]
                        }
                    }))
                ]
            }
        };
    }
}
