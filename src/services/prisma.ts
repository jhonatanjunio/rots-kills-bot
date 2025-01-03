import { PrismaClient } from '@prisma/client';
import fs from 'fs-extra';
import path from 'path';
import { logtail } from '../utils/logtail';

class PrismaService {
  private static instance: PrismaService;
  private prisma: PrismaClient;
  private static readonly DB_DIR = path.join(process.cwd(), 'database');
  private static readonly DB_FILE = path.join(PrismaService.DB_DIR, 'data.db');

  private constructor() {
    this.ensureDatabaseExists();
    this.prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      datasources: {
        db: {
          url: process.env.NODE_ENV === 'production' 
            ? `file:${path.join(process.execPath, '..', 'database', 'data.db')}`
            : `file:${PrismaService.DB_FILE}`
        }
      },
      errorFormat: 'minimal'
    });
  }

  private ensureDatabaseExists(): void {
    try {
      // Garante que o diretório database existe
      if (!fs.existsSync(PrismaService.DB_DIR)) {
        fs.mkdirSync(PrismaService.DB_DIR, { recursive: true });
        logtail.info(`Diretório do banco de dados criado: ${PrismaService.DB_DIR}`);
      }

      // Garante que o arquivo do banco existe
      if (!fs.existsSync(PrismaService.DB_FILE)) {
        fs.writeFileSync(PrismaService.DB_FILE, '');
        logtail.info(`Arquivo do banco de dados criado: ${PrismaService.DB_FILE}`);
      }

      // Verifica permissões
      fs.accessSync(PrismaService.DB_FILE, fs.constants.R_OK | fs.constants.W_OK);
    } catch (error) {
      logtail.error(`Erro ao preparar banco de dados: ${error}`);
      throw new Error(`Falha ao configurar banco de dados: ${error}`);
    }
  }

  public static getInstance(): PrismaService {
    if (!PrismaService.instance) {
      PrismaService.instance = new PrismaService();
    }
    return PrismaService.instance;
  }

  public getClient(): PrismaClient {
    return this.prisma;
  }

  public async connect(): Promise<void> {
    try {
      await this.prisma.$connect();
      console.log('Conexão com o banco de dados estabelecida com sucesso');
    } catch (error) {
      console.error('Erro ao conectar com o banco de dados:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export const prismaService = PrismaService.getInstance();
