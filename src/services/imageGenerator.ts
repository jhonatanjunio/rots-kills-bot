import { createCanvas, loadImage, GlobalFonts, SKRSContext2D } from '@napi-rs/canvas';

import { TeamStats } from '../models/TeamStats';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PlayerKDA } from '../models/Ranking';

export class ImageGenerator {
    private static readonly PLAYERS_PER_PAGE = 10;
    
    private static readonly COLORS = {
        TEXT: '#FFFFFF',
        BACKGROUND: '#2F3136',
        SECONDARY_BG: '#36393F',
        BORDER: '#4F545C',
        SUBTEXT: '#B9BBBE',
        ALLY: '#4ade80',
        ENEMY: '#f87171',
        GOLD: '#FFD700',
        SILVER: '#C0C0C0',
        BRONZE: '#CD7F32',
        ROW_BG_1: '#2b2d31',
        ROW_BG_2: '#2b2d31',
        ROW_BG_3: '#2b2d31',
    };
    
    private static readonly MEDALS = {
        FIRST: 'https://images.emojiterra.com/google/noto-emoji/unicode-16.0/color/svg/1f947.svg',
        SECOND: 'https://images.emojiterra.com/google/noto-emoji/unicode-16.0/color/svg/1f948.svg',
        THIRD: 'https://images.emojiterra.com/google/noto-emoji/unicode-16.0/color/svg/1f949.svg'
    };
    
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
        enemyStats: TeamStats
    ): Promise<{ buffer: Buffer }> {
        console.log('Gerando estatísticas de guerra...');
        console.log('Aliados:', allyStats);
        console.log('Inimigos:', enemyStats);
        
        this.initializeFonts();

        // Constantes para cálculo de altura
        const HEADER_HEIGHT = 80;  // Título principal
        const TEAM_HEADER_HEIGHT = 50; // Cabeçalho de cada time
        const ROW_HEIGHT = 40; // Altura de cada linha de jogador
        const FOOTER_HEIGHT = 50; // Rodapé com totais
        const PADDING_TOP = 40; // Padding superior
        const PADDING_BOTTOM = 40; // Padding inferior
        const SECTION_PADDING = 20; // Padding entre seções

        // Pega o número real de jogadores
        const maxPlayers = Math.max(
            allyStats.players.length,
            enemyStats.players.length
        );

        console.log('Número máximo de jogadores:', maxPlayers);

        // Calcula a altura total necessária
        const contentHeight = HEADER_HEIGHT + // Título
                            PADDING_TOP + // Padding superior
                            TEAM_HEADER_HEIGHT + // Cabeçalho dos times
                            (ROW_HEIGHT * Math.max(maxPlayers, 1)) + // Linhas de jogadores (mínimo 1)
                            SECTION_PADDING + // Espaço entre a lista e o footer
                            FOOTER_HEIGHT + // Rodapé
                            PADDING_BOTTOM; // Padding inferior

        console.log('Altura total do conteúdo:', contentHeight);

        const canvas = createCanvas(1024, contentHeight);
        const ctx = canvas.getContext('2d');

        // Desenha o fundo principal
        ctx.fillStyle = this.COLORS.BACKGROUND;
        ctx.fillRect(0, 0, 1024, contentHeight);

        // Desenha o título
        ctx.font = 'bold 24px Inter';
        ctx.fillStyle = this.COLORS.TEXT;
        ctx.textAlign = 'center';
        ctx.fillText(`Estatísticas de Guerra - ${period}`, 512, 50);

        // Container principal
        const mainY = HEADER_HEIGHT;
        const teamWidth = 482; // (1024 - 60) / 2

        // Time aliado (esquerda)
        await this.drawTeamStats(ctx, 'No Fear to Kill', allyStats, this.COLORS.ALLY, 20, mainY, teamWidth);

        // Divisor central
        ctx.fillStyle = this.COLORS.BORDER;
        ctx.fillRect(512, mainY, 2, contentHeight - HEADER_HEIGHT - PADDING_BOTTOM);

        // Time inimigo (direita)
        await this.drawTeamStats(ctx, 'Inimigos', enemyStats, this.COLORS.ENEMY, 522, mainY, teamWidth);

        return { buffer: canvas.toBuffer('image/png') };
    }

    private static async drawTeamStats(
        ctx: SKRSContext2D,
        title: string,
        stats: TeamStats,
        color: string,
        x: number,
        y: number,
        width: number
    ) {
        console.log(`Desenhando estatísticas para ${title}:`, stats);

        // Background da seção
        const titleHeight = 60;  // Altura do título + padding
        const headerHeight = 40; // Altura do cabeçalho
        const rowHeight = 40;    // Altura de cada linha de jogador
        const footerHeight = 60; // Altura do footer + padding
        const totalRows = stats.players.length || 1; // Garante pelo menos uma linha

        const sectionHeight = titleHeight + 
                             headerHeight + 
                             (rowHeight * totalRows) + 
                             footerHeight;

        ctx.fillStyle = this.COLORS.SECONDARY_BG;
        ctx.fillRect(x, y, width, sectionHeight);

        // Título
        ctx.font = 'bold 20px Inter';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.fillText(title, x + width/2, y + 30);

        // Header da tabela
        const headerY = y + 50;
        ctx.fillStyle = this.COLORS.BACKGROUND;
        ctx.fillRect(x + 10, headerY, width - 20, 40);

        // Pré-carrega as medalhas
        const medalImages = {
            FIRST: await loadImage(this.MEDALS.FIRST),
            SECOND: await loadImage(this.MEDALS.SECOND),
            THIRD: await loadImage(this.MEDALS.THIRD)
        };

        // Colunas do header
        ctx.font = '14px Inter';
        ctx.fillStyle = this.COLORS.TEXT;
        ctx.textAlign = 'left';
        ctx.fillText('Pos', x + 20, headerY + 25);
        ctx.fillText('Jogador', x + 70, headerY + 25);

        const columns = ['K', 'D', 'A', 'KDA'];
        const columnWidth = (width - 200) / columns.length;
        columns.forEach((col, index) => {
            ctx.textAlign = 'center';
            ctx.fillText(col, x + 200 + (columnWidth * index) + columnWidth/2, headerY + 25);
        });

        // Linhas dos jogadores
        let rowY = headerY + 40;
        console.log('Número de jogadores:', stats.players.length);
        
        stats.players.forEach((player, index) => {
            console.log(`Desenhando jogador ${index + 1}:`, player);

            // Linha de fundo
            ctx.fillStyle = index % 2 === 0 ? this.COLORS.BACKGROUND : this.COLORS.SECONDARY_BG;
            ctx.fillRect(x + 10, rowY, width - 20, 40);

            // Posição/Medalha
            if (index < 3) {
                // Desenha medalha para os 3 primeiros
                const medalImage = medalImages[['FIRST', 'SECOND', 'THIRD'][index] as keyof typeof medalImages];
                const medalSize = 20;
                const medalY = rowY + (40 - medalSize) / 2;
                ctx.drawImage(medalImage, x + 20, medalY, medalSize, medalSize);

                // Nome do jogador com cor especial
                ctx.font = '14px Inter';
                ctx.fillStyle = this.COLORS[['GOLD', 'SILVER', 'BRONZE'][index] as keyof typeof this.COLORS];
                ctx.textAlign = 'left';
                ctx.fillText(player.name, x + 70, rowY + 25);
            } else {
                // Posição numérica para os demais
                ctx.font = '14px Inter';
                ctx.fillStyle = this.COLORS.TEXT;
                ctx.textAlign = 'center';
                ctx.fillText((index + 1).toString(), x + 30, rowY + 25);

                // Nome do jogador
                ctx.textAlign = 'left';
                ctx.fillText(player.name, x + 70, rowY + 25);
            }

            // Estatísticas
            ctx.fillStyle = this.COLORS.TEXT;
            ctx.textAlign = 'center';
            [player.kills, player.deaths, player.assists, player.kda.toFixed(2)].forEach((value, statIndex) => {
                ctx.fillText(
                    value.toString(),
                    x + 200 + (columnWidth * statIndex) + columnWidth/2,
                    rowY + 25
                );
            });

            rowY += 40;
        });

        // Rodapé com totais
        const footerY = rowY + 10;
        ctx.fillStyle = this.COLORS.BACKGROUND;
        ctx.fillRect(x + 10, footerY, width - 20, 40);

        ctx.font = 'bold 14px Inter';
        ctx.fillStyle = this.COLORS.TEXT;
        ctx.textAlign = 'left';
        ctx.fillText('Total', x + 70, footerY + 25);

        // Estatísticas totais
        ctx.textAlign = 'center';
        [
            stats.totalKills,
            stats.totalDeaths,
            stats.totalAssists,
            stats.averageKDA.toFixed(2)
        ].forEach((value, index) => {
            ctx.fillText(
                value.toString(),
                x + 200 + (columnWidth * index) + columnWidth/2,
                footerY + 25
            );
        });
    }

    static async generateRankingStats(
        period: string,
        playerStats: PlayerKDA[],
        page: number = 1
    ): Promise<{ buffer: Buffer }> {
        this.initializeFonts();

        const PLAYERS_PER_PAGE = 15;
        const startIndex = (page - 1) * PLAYERS_PER_PAGE;
        const endIndex = startIndex + PLAYERS_PER_PAGE;
        const paginatedStats = playerStats.slice(startIndex, endIndex);

        // Mantém as mesmas constantes de altura
        const HEADER_HEIGHT = 80;
        const TABLE_HEADER_HEIGHT = 50;
        const ROW_HEIGHT = 40;
        const PADDING = 40;

        const contentHeight = HEADER_HEIGHT + 
                            TABLE_HEADER_HEIGHT + 
                            (ROW_HEIGHT * paginatedStats.length) + 
                            PADDING;

        const canvas = createCanvas(1024, contentHeight);
        const ctx = canvas.getContext('2d');

        // Desenha o fundo
        ctx.fillStyle = this.COLORS.BACKGROUND;
        ctx.fillRect(0, 0, 1024, contentHeight);

        // Desenha o título
        ctx.font = 'bold 24px Inter';
        ctx.fillStyle = this.COLORS.TEXT;
        ctx.textAlign = 'center';
        ctx.fillText(`Ranking de Guerreiros - ${period}`, 512, 50);

        // Container da tabela
        const tableY = HEADER_HEIGHT;
        ctx.fillStyle = this.COLORS.SECONDARY_BG;
        ctx.fillRect(20, tableY, 984, contentHeight - HEADER_HEIGHT - 20);

        // Cabeçalho da tabela usando createRankingHeader
        const headerY = tableY + 20;
        const header = this.createRankingHeader();
        ctx.fillStyle = this.COLORS.BACKGROUND;
        ctx.fillRect(30, headerY, 964, 40);

        // Desenha as colunas do cabeçalho usando os dados do header
        const columnWidths = [80, 240, 160, 160, 160, 160];
        let xPos = 30;
        header.props.children.forEach((headerCol: any, index: number) => {
            ctx.font = '14px Inter';
            ctx.fillStyle = this.COLORS.SUBTEXT;
            ctx.textAlign = index === 1 ? 'left' : 'center';
            const textX = index === 1 ? xPos + 10 : xPos + columnWidths[index]/2;
            ctx.fillText(headerCol.props.children[0], textX, headerY + 25);
            xPos += columnWidths[index];
        });

        // Pré-carrega as imagens das medalhas
        const medalImages = {
            FIRST: await loadImage(this.MEDALS.FIRST),
            SECOND: await loadImage(this.MEDALS.SECOND),
            THIRD: await loadImage(this.MEDALS.THIRD)
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
                    ctx.fillStyle = cell.props.style.color || this.COLORS.TEXT;
                    ctx.textAlign = index === 1 ? 'left' : 'center';
                    const textX = index === 1 ? xPos + 10 : xPos + columnWidths[index]/2;
                    ctx.fillText(text, textX, rowY + 25);
                }
                xPos += columnWidths[index];
            });

            // Linha divisória
            ctx.fillStyle = this.COLORS.BORDER;
            ctx.fillRect(30, rowY + 39, 964, 1);

            rowY += 40;
        });

        return { buffer: canvas.toBuffer('image/png') };
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

        const POSITION_STYLES = {
            1: {
                color: this.COLORS.GOLD,
                background: this.COLORS.ROW_BG_1,
                image: this.MEDALS.FIRST
            },
            2: {
                color: this.COLORS.SILVER,
                background: this.COLORS.ROW_BG_2,
                image: this.MEDALS.SECOND
            },
            3: {
                color: this.COLORS.BRONZE,
                background: this.COLORS.ROW_BG_3,
                image: this.MEDALS.THIRD
            }
        };

        const style = POSITION_STYLES[position as keyof typeof POSITION_STYLES];

        return {
            type: 'div',
            props: {
                style: {
                    display: 'flex',
                    padding: '8px',
                    borderBottom: `1px solid ${this.COLORS.BORDER}`,
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
