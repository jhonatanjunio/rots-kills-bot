import { createCanvas, loadImage, GlobalFonts, SKRSContext2D } from '@napi-rs/canvas';

import { TeamStats } from '../models/TeamStats';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PlayerKDA } from '../models/Ranking';

export class ImageGenerator {
    private static readonly PLAYERS_PER_PAGE = 10;
    
    private static initializeFonts() {
        GlobalFonts.registerFromPath(
            join(__dirname, '../../assets/fonts/Inter-Medium.ttf'),
            'Inter'
        );
        GlobalFonts.registerFromPath(
            join(__dirname, '../../assets/fonts/Inter-Bold.ttf'),
            'Inter Bold'
        );
    }

    static async generateWarStats(
        period: string,
        allyStats: TeamStats,
        enemyStats: TeamStats,
        page: number = 1
    ): Promise<{ buffer: Buffer; totalPages: number }> {
        this.initializeFonts();

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
        const HEADER_HEIGHT = 80;  // Título principal
        const TEAM_HEADER_HEIGHT = 50; // Cabeçalho de cada time
        const ROW_HEIGHT = 40; // Altura de cada linha de jogador
        const FOOTER_HEIGHT = 50; // Rodapé com totais
        const PADDING_TOP = 40; // Padding superior
        const PADDING_BOTTOM = 40; // Padding inferior
        const SECTION_PADDING = 20; // Padding entre seções
        const EXTRA_SPACE = 100; // Espaço extra para garantir que nada seja cortado

        // Pega o número real de jogadores na página atual
        const currentPagePlayersCount = Math.max(
            paginatedAllyStats.players.length,
            paginatedEnemyStats.players.length
        );

        // Calcula a altura total necessária
        const contentHeight = HEADER_HEIGHT + // Título
                            PADDING_TOP + // Padding superior
                            TEAM_HEADER_HEIGHT + // Cabeçalho dos times
                            (ROW_HEIGHT * currentPagePlayersCount) + // Linhas de jogadores
                            SECTION_PADDING + // Espaço entre a lista e o footer
                            FOOTER_HEIGHT + // Rodapé
                            PADDING_BOTTOM + // Padding inferior
                            EXTRA_SPACE; // Espaço extra de segurança

        const canvas = createCanvas(1024, contentHeight);
        const ctx = canvas.getContext('2d');

        const COLORS = {
            TEXT: '#FFFFFF',
            BACKGROUND: '#2F3136',
            SECONDARY_BG: '#36393F',
            BORDER: '#4F545C',
            SUBTEXT: '#B9BBBE',
            GOLD: '#FFD700',
            SILVER: '#C0C0C0',
            BRONZE: '#CD7F32',
            ROW_BG_1: '#2b2d31',
            ROW_BG_2: '#2b2d31',
            ROW_BG_3: '#2b2d31',
            ALLY: '#4ade80',
            ENEMY: '#f87171',
        };

        // Desenha o fundo
        ctx.fillStyle = COLORS.BACKGROUND;
        ctx.fillRect(0, 0, 1024, contentHeight);

        // Desenha o título
        ctx.font = 'bold 24px Inter';
        ctx.fillStyle = COLORS.TEXT;
        ctx.textAlign = 'center';
        ctx.fillText(`Estatísticas de Guerra - ${period}`, 512, 50);

        // Container principal
        const mainY = HEADER_HEIGHT;
        const teamWidth = 482; // (1024 - 60) / 2

        // Time aliado (esquerda)
        this.drawTeamStats(ctx, 'No Fear to Kill', paginatedAllyStats, COLORS.ALLY, 20, mainY, teamWidth);

        // Divisor central
        ctx.fillStyle = COLORS.BORDER;
        ctx.fillRect(512, mainY, 2, contentHeight - HEADER_HEIGHT - PADDING_BOTTOM);

        // Time inimigo (direita)
        this.drawTeamStats(ctx, 'Inimigos', paginatedEnemyStats, COLORS.ENEMY, 522, mainY, teamWidth);

        return {
            buffer: canvas.toBuffer('image/png'),
            totalPages: maxPlayers > this.PLAYERS_PER_PAGE ? totalPages : 1
        };
    }

    private static drawTeamStats(
        ctx: SKRSContext2D,
        title: string,
        stats: TeamStats,
        color: string,
        x: number,
        y: number,
        width: number
    ) {
        // Desenha o fundo da seção
        ctx.fillStyle = '#36393F';
        ctx.fillRect(x, y, width, 400);

        // Título do time
        ctx.font = 'bold 20px Inter';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText(title, x + width/2, y + 30);

        // Cabeçalho da tabela
        const headerY = y + 60;
        ctx.fillStyle = '#2F3136';
        ctx.fillRect(x + 10, headerY, width - 20, 40);

        // Colunas do cabeçalho
        ctx.font = '14px Inter';
        ctx.fillStyle = '#B9BBBE';
        ctx.textAlign = 'left';
        ctx.fillText('Jogador', x + 20, headerY + 25);

        const columns = ['K', 'D', 'A', 'KDA'];
        const columnWidth = (width - 150) / columns.length;
        columns.forEach((col, index) => {
            ctx.textAlign = 'center';
            ctx.fillText(col, x + 150 + (columnWidth * index) + columnWidth/2, headerY + 25);
        });

        // Linhas dos jogadores
        let rowY = headerY + 50;
        stats.players.forEach(player => {
            ctx.fillStyle = '#4F545C';
            ctx.fillRect(x + 10, rowY, width - 20, 1);

            ctx.font = '14px Inter';
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'left';
            ctx.fillText(player.name, x + 20, rowY + 25);

            const values = [player.kills, player.deaths, player.assists, player.kda.toFixed(2)];
            values.forEach((value, index) => {
                ctx.textAlign = 'center';
                ctx.fillText(value.toString(), x + 150 + (columnWidth * index) + columnWidth/2, rowY + 25);
            });

            rowY += 40;
        });

        // Rodapé com totais
        const footerY = rowY + 20;
        ctx.fillStyle = '#2F3136';
        ctx.fillRect(x + 10, footerY, width - 20, 40);

        ctx.font = 'bold 14px Inter';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.fillText('Total', x + 20, footerY + 25);

        const totals = [
            stats.totalKills,
            stats.totalDeaths,
            stats.totalAssists,
            stats.averageKDA.toFixed(2)
        ];
        totals.forEach((value, index) => {
            ctx.textAlign = 'center';
            ctx.fillText(value.toString(), x + 150 + (columnWidth * index) + columnWidth/2, footerY + 25);
        });
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
        this.initializeFonts();

        // Mantém a mesma lógica de paginação
        const startIndex = (page - 1) * this.PLAYERS_PER_PAGE;
        const endIndex = startIndex + this.PLAYERS_PER_PAGE;
        const paginatedStats = playerStats.slice(startIndex, endIndex);
        const totalPages = Math.ceil(playerStats.length / this.PLAYERS_PER_PAGE);

        // Mantém as mesmas constantes de altura
        const HEADER_HEIGHT = 80;
        const TABLE_HEADER_HEIGHT = 50;
        const ROW_HEIGHT = 40;
        const PADDING = 40;

        const contentHeight = HEADER_HEIGHT + 
                            TABLE_HEADER_HEIGHT + 
                            (ROW_HEIGHT * paginatedStats.length) + 
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
            ROW_BG_1: '#2b2d31',
            ROW_BG_2: '#2b2d31',
            ROW_BG_3: '#2b2d31',
        };

        const MEDALS = {
            FIRST: 'https://images.emojiterra.com/google/noto-emoji/unicode-16.0/color/svg/1f947.svg',
            SECOND: 'https://images.emojiterra.com/google/noto-emoji/unicode-16.0/color/svg/1f948.svg',
            THIRD: 'https://images.emojiterra.com/google/noto-emoji/unicode-16.0/color/svg/1f949.svg'
        };

        const canvas = createCanvas(1024, contentHeight);
        const ctx = canvas.getContext('2d');

        // Desenha o fundo
        ctx.fillStyle = COLORS.BACKGROUND;
        ctx.fillRect(0, 0, 1024, contentHeight);

        // Desenha o título
        ctx.font = 'bold 24px Inter';
        ctx.fillStyle = COLORS.TEXT;
        ctx.textAlign = 'center';
        ctx.fillText(`Ranking de Guerreiros - ${period}`, 512, 50);

        // Container da tabela
        const tableY = HEADER_HEIGHT;
        ctx.fillStyle = COLORS.SECONDARY_BG;
        ctx.fillRect(20, tableY, 984, contentHeight - HEADER_HEIGHT - 20);

        // Cabeçalho da tabela usando createRankingHeader
        const headerY = tableY + 20;
        const header = this.createRankingHeader();
        ctx.fillStyle = COLORS.BACKGROUND;
        ctx.fillRect(30, headerY, 964, 40);

        // Desenha as colunas do cabeçalho usando os dados do header
        const columnWidths = [80, 240, 160, 160, 160, 160];
        let xPos = 30;
        header.props.children.forEach((headerCol: any, index: number) => {
            ctx.font = '14px Inter';
            ctx.fillStyle = COLORS.SUBTEXT;
            ctx.textAlign = index === 1 ? 'left' : 'center';
            const textX = index === 1 ? xPos + 10 : xPos + columnWidths[index]/2;
            ctx.fillText(headerCol.props.children[0], textX, headerY + 25);
            xPos += columnWidths[index];
        });

        // Pré-carrega as imagens das medalhas
        const medalImages = {
            FIRST: await loadImage(MEDALS.FIRST),
            SECOND: await loadImage(MEDALS.SECOND),
            THIRD: await loadImage(MEDALS.THIRD)
        };

        // Linhas dos jogadores usando createRankingRow
        let rowY = headerY + 50;
        paginatedStats.forEach((player, index) => {
            const position = startIndex + index + 1;
            const row = this.createRankingRow(player, position);
            
            // Aplica o background da linha baseado na posição
            if (position <= 3) {
                ctx.fillStyle = row.props.style.backgroundColor as string;
                ctx.fillRect(30, rowY, 964, 40);
            }

            // Desenha as células usando os dados do row
            xPos = 30;
            row.props.children.forEach((cell: any, index: number) => {
                if (index === 0 && position <= 3) {
                    // Desenha medalha para os 3 primeiros
                    const medalImage = medalImages[['FIRST', 'SECOND', 'THIRD'][position - 1] as keyof typeof medalImages];
                    const medalSize = 20;
                    const medalY = rowY + (40 - medalSize) / 2;
                    ctx.drawImage(medalImage, xPos + (columnWidths[0] - medalSize) / 2, medalY, medalSize, medalSize);
                } else {
                    const text = typeof cell.props.children === 'string' 
                        ? cell.props.children 
                        : cell.props.children[0].toString();
                    
                    ctx.font = '14px Inter';
                    ctx.fillStyle = cell.props.style.color || COLORS.TEXT;
                    ctx.textAlign = index === 1 ? 'left' : 'center';
                    const textX = index === 1 ? xPos + 10 : xPos + columnWidths[index]/2;
                    ctx.fillText(text, textX, rowY + 25);
                }
                xPos += columnWidths[index];
            });

            // Linha divisória
            ctx.fillStyle = COLORS.BORDER;
            ctx.fillRect(30, rowY + 39, 964, 1);

            rowY += 40;
        });

        return {
            buffer: canvas.toBuffer('image/png'),
            totalPages
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
