import { PrismaClient } from '@prisma/client';
import fs from 'fs-extra';
import path from 'path';
import { logtail } from '../utils/logtail';
import { execSync } from 'child_process';

class PrismaService {
  private static instance: PrismaService;
  private prisma: PrismaClient;
  private static readonly DB_DIR = path.join(process.cwd(), 'database');
  private static readonly DB_FILE = path.join(PrismaService.DB_DIR, 'data.db');
  private initialized: boolean = false;

  private constructor() {
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

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await this.ensureDatabaseExists();
    await this.ensureTablesExist();
    this.initialized = true;
  }

  private async ensureTablesExist(): Promise<void> {
    try {
      console.log('🔄 Verificando e criando tabelas do banco de dados...');

      if (process.env.NODE_ENV === 'development') {
        // Em desenvolvimento, usa o prisma db push
        execSync('npx prisma db push --skip-generate', {
          stdio: 'inherit'
        });
      } else {
        // Em produção, cria as tabelas diretamente via SQL
        await this.prisma.$executeRaw`
          CREATE TABLE IF NOT EXISTS Player (
            id INTEGER PRIMARY KEY,
            name TEXT UNIQUE NOT NULL,
            level INTEGER NOT NULL,
            vocation INTEGER NOT NULL,
            isAlly BOOLEAN NOT NULL
          )
        `;
      }

      console.log('✅ Tabelas verificadas e atualizadas com sucesso');
    } catch (error) {
      console.error('❌ Erro ao criar/atualizar tabelas:', error);
      logtail.error(`Erro ao criar/atualizar tabelas: ${error}`);
      throw error;
    }
  }

  private async ensureDatabaseExists(): Promise<void> {
    try {
      // Garante que o diretório database existe
      if (!fs.existsSync(PrismaService.DB_DIR)) {
        console.log('📁 Criando diretório do banco de dados...');
        fs.mkdirSync(PrismaService.DB_DIR, { recursive: true });
      }

      // Se o arquivo não existe ou está corrompido, recria
      if (!fs.existsSync(PrismaService.DB_FILE) || this.isDatabaseCorrupted()) {
        console.log('🔄 Inicializando novo banco de dados...');
        await this.initializeDatabase();
      }

      // Verifica permissões
      fs.accessSync(PrismaService.DB_FILE, fs.constants.R_OK | fs.constants.W_OK);
    } catch (error) {
      logtail.error(`Erro ao preparar banco de dados: ${error}`);
      throw new Error(`Falha ao configurar banco de dados: ${error}`);
    }
  }

  private isDatabaseCorrupted(): boolean {
    try {
      const header = fs.readFileSync(PrismaService.DB_FILE, { encoding: 'utf8', flag: 'r' });
      return !header.includes('SQLite format 3');
    } catch {
      return true;
    }
  }

  private async initializeDatabase(): Promise<void> {
    try {
      // Remove o arquivo se existir
      if (fs.existsSync(PrismaService.DB_FILE)) {
        fs.unlinkSync(PrismaService.DB_FILE);
      }

      // Cria um novo arquivo vazio
      fs.writeFileSync(PrismaService.DB_FILE, '');

      // Inicializa o banco com uma estrutura básica
      const sqlite3 = require('sqlite3').verbose();
      const db = new sqlite3.Database(PrismaService.DB_FILE);
      
      await new Promise<void>((resolve, reject) => {
        db.run('PRAGMA journal_mode = WAL;', (err: Error | null) => {
          if (err) reject(err);
          else resolve();
        });
      });

      db.close();
      
      console.log('✅ Banco de dados inicializado com sucesso');
    } catch (error) {
      console.error('❌ Erro ao criar novo banco:', error);
      throw error;
    }
  }

  public static async getInstance(): Promise<PrismaService> {
    if (!PrismaService.instance) {
      PrismaService.instance = new PrismaService();
      await PrismaService.instance.initialize();
    }
    return PrismaService.instance;
  }

  public getClient(): PrismaClient {
    if (!this.initialized) {
      throw new Error('PrismaService não foi inicializado. Chame getInstance() primeiro.');
    }
    return this.prisma;
  }

  public async connect(): Promise<void> {
    if (!this.initialized) {
      throw new Error('PrismaService não foi inicializado. Chame getInstance() primeiro.');
    }

    try {
      await this.prisma.$connect();
      
      // Testa a conexão tentando acessar a tabela Player
      await this.prisma.player.count();
      
      console.log('✅ Conexão com o banco de dados estabelecida com sucesso');
    } catch (error) {
      console.error('❌ Erro ao conectar com o banco de dados:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export async function getPrismaService(): Promise<PrismaService> {
  return await PrismaService.getInstance();
}
