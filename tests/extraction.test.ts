import { describe, expect, it } from 'vitest';
import { parseModelJson, pickChunks } from '../shared/extraction';

describe('lectura de la respuesta del modelo', () => {
  it('acepta la respuesta ya convertida en objeto (Llama 3.3 en Workers AI)', () => {
    expect(parseModelJson({ obligations: [{ title: 'a' }] }).obligations).toHaveLength(1);
  });
  it('acepta texto con JSON dentro', () => {
    expect(parseModelJson('Aquí va: {"obligations":[{"title":"a"},{"title":"b"}]}').obligations).toHaveLength(2);
  });
  it('rescata los compromisos completos si la respuesta viene cortada', () => {
    expect(parseModelJson('{"obligations":[{"title":"a \\"x\\" }"},{"title":"b","quote":"cort').obligations).toHaveLength(1);
  });
  it('no se cae con respuestas vacías', () => {
    expect(parseModelJson(undefined)).toEqual({});
  });
});

describe('qué partes del documento se leen', () => {
  it('en una RCA con la plantilla actual, lee completa la sección de condiciones y compromisos', () => {
    const relleno = 'Descripción de las viviendas y redes de agua potable del proyecto.\n\n'.repeat(1500);
    const compromisos = '8°. Que, para ejecutar el Proyecto deben cumplirse las siguientes condiciones o exigencias:\n\n' +
      '9.1. Compromiso ambiental voluntario 1. Informe mensual a la SMA.\n\n'.repeat(400) + '\nRESUELVO:\n1°. Calificar favorablemente.';
    const { chunks, focused } = pickChunks(relleno + compromisos, 8);
    expect(focused).toBe(true);
    expect(chunks.join('\n')).toContain('RESUELVO');
    expect(chunks.join('\n')).toContain('condiciones o exigencias');
  });
});
