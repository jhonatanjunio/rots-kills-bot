import { readFileSync } from 'fs';
import path from 'path';

export class MockGameAPI {
    static getTestData(scenario: string) {
        const filePath = path.join(process.cwd(), 'src', 'tests', 'data', `${scenario}.json`);
        const data = readFileSync(filePath, 'utf-8');
        return JSON.parse(data);
    }
}
