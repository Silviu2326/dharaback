const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * Servicio para análisis de documentos usando Google Gemini AI
 */
class GeminiService {
  constructor() {
    this.genAI = null;
    this.model = null;

    // Inicializar solo si hay API key configurada
    if (process.env.GEMINI_API_KEY) {
      this.initialize();
    } else if (process.env.GEMINI_API_KEY_2) {
      this.initialize(process.env.GEMINI_API_KEY_2);
    } else if (process.env.GEMINI_API_KEY_3) {
      this.initialize(process.env.GEMINI_API_KEY_3);
    } else {
      console.warn(
        "⚠️ GEMINI_API_KEY no configurada. El análisis de titulaciones estará deshabilitado.",
      );
    }
  }

  /**
   * Inicializa el cliente de Gemini
   */
  initialize(apiKey = process.env.GEMINI_API_KEY) {
    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
      this.model = this.genAI.getGenerativeModel({
        model: modelName,
      });
      console.log(`✅ Gemini AI inicializado correctamente con modelo: ${modelName}`);
    } catch (error) {
      console.error("❌ Error al inicializar Gemini:", error);
    }
  }

  /**
   * Verifica si el servicio está configurado
   */
  isConfigured() {
    return !!(this.genAI && this.model);
  }

  /**
   * Analiza una imagen de titulación para verificar si es válida
   * @param {Buffer} imageBuffer - Buffer de la imagen
   * @param {string} mimeType - Tipo MIME de la imagen (image/jpeg, image/png, etc.)
   * @param {Object} context - Contexto adicional (nombre, especialidad, etc.)
   * @returns {Promise<Object>} Resultado del análisis
   */
  async analyzeDegreeCertificate(imageBuffer, mimeType, context = {}) {
    if (!this.isConfigured()) {
      throw new Error(
        "Gemini AI no está configurado. Verifica GEMINI_API_KEY.",
      );
    }

    try {
      // Convertir buffer a base64
      const base64Image = imageBuffer.toString("base64");

      // Construir el prompt para el análisis
      const prompt = this._buildAnalysisPrompt(context);

      // Crear el contenido para el modelo
      const result = await this.model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Image,
                },
              },
            ],
          },
        ],
      });

      const response = await result.response;
      const text = response.text();

      // Parsear la respuesta JSON
      return this._parseAnalysisResponse(text);
    } catch (error) {
      console.error("❌ Error analizando titulación con Gemini:", error);
      throw new Error(
        `Error en el análisis de la titulación: ${error.message}`,
      );
    }
  }

  /**
   * Construye el prompt para el análisis de la titulación
   */
  _buildAnalysisPrompt(context) {
    const { nombre, especialidad, titulacion } = context;

    return `Analiza esta imagen de documento y determina si es un DOCUMENTO DE FORMACIÓN O CERTIFICACIÓN válido para un TERAPEUTA HOLÍSTICO.

CONTEXTO DEL REGISTRO:
- Nombre del terapeuta: ${nombre || "No proporcionado"}
- Especialidad declarada: ${especialidad || "No proporcionada"}
- Título declarado: ${titulacion || "No proporcionado"}

IMPORTANTE: Este registro es para TERAPEUTAS HOLÍSTICOS/ALTERNATIVOS. Las titulaciones de este sector incluyen:
- Diplomas de escuelas de naturopatía, homeopatía, acupuntura
- Certificados de asociaciones de terapeutas (ATHHTA, etc.)
- Cursos de reprogramación mental, coaching transformacional
- Certificaciones de reiki, sanación cuántica, otras terapias alternativas
- Formación en coaching, PNL, programación neurolingüística
- Cualquier documento que acredite formación en terapias alternativas/complementarias

INSTRUCCIONES DE ANÁLISIS:
1. Si el documento muestra formación en terapias holísticas/alternativas, es VÁLIDO
2. Verifica que sea legible y contenga información del curso/título
3. La entidad emitente puede ser una asociación, escuela o instituto de terapias alternativas
4. No seas muy estricto con el formato - acepta diplomas, certificados, constancias
5. Solo rechaza si claramente NO es un documento de formación (ej: factura, publicidad)

TIPOS DE DOCUMENTOS VÁLIDOS (para este caso):
- Diplomas de cursos de terapias alternativas
- Certificados de asociaciones de terapeutas
- Constancias de formación en coaching, PNL, reiki, etc.
- Títulos de naturopatía, homeopatía, acupuntura
- Certificados de especialización en terapias holísticas
- CUALQUIER documento que acredite formación relacionada con bienestar/salud alternativa

RESPONSE FORMAT (JSON estricto):
{
  "esTitulacionValida": boolean,
  "tipoDocumento": "titulo_universitario|diploma_formacion|certificado_profesional|licencia_colegial|diploma_holistico|certificado_curso|otro",
  "nombreTitulo": "string (nombre exacto del título si es visible)",
  "entidadEmisora": "string (nombre de la universidad/institución/asociación)",
  "coincideEspecialidad": boolean,
  "camposDetectados": {
    "nombreTitulado": "string o null",
    "fechaEmision": "string o null",
    "numeroRegistro": "string o null"
  },
  "nivelConfianza": "alto|medio|bajo",
  "observaciones": "string (detalles importantes)",
  "recomendacion": "aceptar|revisar_manualmente|rechazar"
}

REGLAS CLAVE:
- Si el documento acredita formación en terapias alternativas/holísticas -> esTitulacionValida: true, recomendacion: "aceptar"
- Solo rechazar si es claramente falso, illegible o NO relacionado con formación
- Ante la duda -> aceptarlo (revisar_manualmente como máximo)

IMPORTANTE: Responde ÚNICAMENTE con el JSON válido, sin texto adicional.`;
  }

  /**
   * Parsea la respuesta del modelo
   */
  _parseAnalysisResponse(text) {
    try {
      // Limpiar el texto de posibles marcadores markdown
      let cleanText = text.trim();

      // Eliminar bloques de código markdown si existen
      if (cleanText.startsWith("```json")) {
        cleanText = cleanText.replace(/```json\n?/, "").replace(/```$/, "");
      } else if (cleanText.startsWith("```")) {
        cleanText = cleanText.replace(/```\n?/, "").replace(/```$/, "");
      }

      cleanText = cleanText.trim();

      // Parsear JSON
      const result = JSON.parse(cleanText);

      // Validar estructura mínima
      if (typeof result.esTitulacionValida !== "boolean") {
        throw new Error(
          "Respuesta inválida: esTitulacionValida no es booleano",
        );
      }

      return {
        esTitulacionValida: result.esTitulacionValida,
        tipoDocumento: result.tipoDocumento || "desconocido",
        nombreTitulo: result.nombreTitulo || null,
        entidadEmisora: result.entidadEmisora || null,
        coincideEspecialidad: result.coincideEspecialidad || false,
        camposDetectados: result.camposDetectados || {},
        nivelConfianza: result.nivelConfianza || "bajo",
        observaciones: result.observaciones || "Sin observaciones",
        recomendacion: result.recomendacion || "revisar_manualmente",
        analizadoPorAI: true,
      };
    } catch (parseError) {
      console.error("❌ Error parseando respuesta de Gemini:", parseError);
      console.log("Texto recibido:", text);

      // Retornar respuesta por defecto en caso de error
      return {
        esTitulacionValida: false,
        tipoDocumento: "error",
        nombreTitulo: null,
        entidadEmisora: null,
        coincideEspecialidad: false,
        camposDetectados: {},
        nivelConfianza: "bajo",
        observaciones:
          "Error al analizar la respuesta del AI. Se requiere revisión manual.",
        recomendacion: "revisar_manualmente",
        analizadoPorAI: false,
        errorParseo: true,
      };
    }
  }

  /**
   * Analiza múltiples imágenes de titulación
   * @param {Array<{buffer: Buffer, mimeType: string}>} images - Array de imágenes
   * @param {Object} context - Contexto del registro
   * @returns {Promise<Array>} Resultados del análisis
   */
  async analyzeMultipleDegrees(images, context = {}) {
    if (!Array.isArray(images) || images.length === 0) {
      throw new Error("Se requiere al menos una imagen para analizar");
    }

    const results = [];

    for (let i = 0; i < images.length; i++) {
      const { buffer, mimeType } = images[i];

      try {
        const analysis = await this.analyzeDegreeCertificate(buffer, mimeType, {
          ...context,
          indiceImagen: i + 1,
          totalImagenes: images.length,
        });

        results.push({
          index: i,
          success: true,
          ...analysis,
        });
      } catch (error) {
        results.push({
          index: i,
          success: false,
          error: error.message,
          esTitulacionValida: false,
          recomendacion: "revisar_manualmente",
        });
      }
    }

    return results;
  }
}

// Exportar instancia singleton
module.exports = new GeminiService();
