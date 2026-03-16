const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

/**
 * Servicio para análisis de documentos usando Google Gemini AI
 */
class GeminiService {
  constructor() {
    this.genAI = null;
    this.model = null;
    this.terapias = [];
    this.nombresTerapias = [];

    // Cargar catálogo de terapias
    this._loadTerapiasCatalog();

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
   * Carga el catálogo de terapias desde el archivo JSON
   */
  _loadTerapiasCatalog() {
    try {
      // Buscar el archivo en diferentes ubicaciones posibles
      const possiblePaths = [
        path.join(__dirname, "../../public/terapias.json"),
        path.join(__dirname, "../../../public/terapias.json"),
        path.join(__dirname, "../../../../public/terapias.json"),
        "/app/public/terapias.json",
        "./public/terapias.json",
      ];

      let terapiasPath = null;
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          terapiasPath = p;
          break;
        }
      }

      if (!terapiasPath) {
        console.warn(
          "⚠️ No se encontró el archivo terapias.json. La identificación de terapias estará deshabilitada."
        );
        return;
      }

      const data = JSON.parse(fs.readFileSync(terapiasPath, "utf8"));
      this.terapias = data.terapias || [];
      this.nombresTerapias = this.terapias.map((t) =>
        t.nombre.toLowerCase().trim()
      );

      console.log(
        `✅ Catálogo de terapias cargado: ${this.terapias.length} terapias disponibles`
      );
    } catch (error) {
      console.error("❌ Error cargando catálogo de terapias:", error.message);
      this.terapias = [];
      this.nombresTerapias = [];
    }
  }

  /**
   * Busca coincidencias de terapias en un texto
   * @param {string} text - Texto a analizar
   * @returns {Array} Lista de terapias encontradas
   */
  findMatchingTerapias(text) {
    if (!text || this.terapias.length === 0) {
      return [];
    }

    const textLower = text.toLowerCase();
    const matches = [];

    for (const terapia of this.terapias) {
      const nombreLower = terapia.nombre.toLowerCase();

      // Coincidencia exacta
      if (textLower.includes(nombreLower)) {
        matches.push({
          id: terapia.id,
          nombre: terapia.nombre,
          tipoMatch: "exacto",
          confianza: "alta",
        });
        continue;
      }

      // Coincidencia parcial (para nombres compuestos)
      const palabras = nombreLower.split(/\s+/);
      const palabrasEncontradas = palabras.filter((palabra) =>
        textLower.includes(palabra)
      );

      if (palabrasEncontradas.length >= 2 ||
          (palabras.length === 1 && palabrasEncontradas.length === 1)) {
        matches.push({
          id: terapia.id,
          nombre: terapia.nombre,
          tipoMatch: "parcial",
          confianza: palabrasEncontradas.length >= 2 ? "alta" : "media",
        });
      }
    }

    // Eliminar duplicados y ordenar por confianza
    const uniqueMatches = matches.filter(
      (match, index, self) =>
        index === self.findIndex((m) => m.nombre === match.nombre)
    );

    return uniqueMatches.sort((a, b) => {
      const confianzaOrder = { alta: 3, media: 2, baja: 1 };
      return confianzaOrder[b.confianza] - confianzaOrder[a.confianza];
    });
  }

  /**
   * Obtiene las terapias declaradas por el usuario para validación
   * @param {string} especialidad - Especialidad declarada
   * @returns {Array} Lista de terapias declaradas
   */
  getTerapiasDeclaradas(especialidad) {
    if (!especialidad) return [];

    const especialidades = especialidad
      .split(/[,;]/)
      .map((e) => e.trim().toLowerCase());

    return this.terapias.filter((t) => {
      const nombreLower = t.nombre.toLowerCase();
      return especialidades.some((esp) => {
        // Coincidencia exacta
        if (nombreLower === esp) return true;
        // Coincidencia parcial
        if (nombreLower.includes(esp) || esp.includes(nombreLower)) return true;
        return false;
      });
    });
  }

  /**
   * Inicializa el cliente de Gemini
   */
  initialize(apiKey = process.env.GEMINI_API_KEY) {
    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";
      this.model = this.genAI.getGenerativeModel({
        model: modelName,
      }, {
        apiVersion: "v1"
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
   * Analiza un documento de titulación (imagen o PDF) para verificar si es válido
   * @param {Buffer} fileBuffer - Buffer del archivo
   * @param {string} mimeType - Tipo MIME del archivo (image/jpeg, image/png, application/pdf, etc.)
   * @param {Object} context - Contexto adicional (nombre, especialidad, etc.)
   * @returns {Promise<Object>} Resultado del análisis
   */
  async analyzeDegreeCertificate(fileBuffer, mimeType, context = {}) {
    if (!this.isConfigured()) {
      throw new Error(
        "Gemini AI no está configurado. Verifica GEMINI_API_KEY.",
      );
    }

    try {
      // Determinar si es PDF o imagen
      const isPDF = mimeType === 'application/pdf';
      
      if (isPDF) {
        console.log('📄 Procesando PDF para análisis con Gemini...');
      }

      // Convertir buffer a base64
      const base64Data = fileBuffer.toString("base64");

      // Construir el prompt para el análisis
      const prompt = isPDF 
        ? this._buildPDFAnalysisPrompt(context)
        : this._buildAnalysisPrompt(context);

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
                  data: base64Data,
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
   * Obtiene la lista de terapias para incluir en el prompt
   */
  _getTerapiasListForPrompt() {
    if (this.terapias.length === 0) {
      return "No disponible";
    }
    // Tomar las primeras 50 terapias para no hacer el prompt muy largo
    // Las más comunes primero
    const terapiasPrioritarias = [
      "Acupuntura", "Acupresión", "Ayurveda", "Reiki", "Shiatsu",
      "Naturopatía", "Homeopatía", "Quiromasaje", "Reflexología",
      "Coaching", "Mindfulness", "Yoga", "Meditación", "PNL",
      "Fitoterapia", "Aromaterapia", "Craniosacral", "Osteopatía",
      "Quiropraxia", "Fisioterapia", "Psicología", "Psicoterapia",
      "Terapia floral", "Constelaciones familiares", "Bioenergética",
      "Arteterapia", "Musicoterapia", "Danza terapia", "Gestalt",
      "Hipnosis", "Regresiones", "Sanación energética", "Chi Kung",
      "Tai Chi", "Pilates", "Ozonoterapia", "Mesoterapia",
      "Apiterapia", "Flores de Bach", "Cristaloterapia", "Tarot terapéutico"
    ];

    const restoTerapias = this.terapias
      .filter(t => !terapiasPrioritarias.includes(t.nombre))
      .slice(0, 68)
      .map(t => t.nombre);

    return [...terapiasPrioritarias, ...restoTerapias].join(", ");
  }

  /**
   * Construye el prompt para el análisis de la titulación
   */
  _buildAnalysisPrompt(context) {
    const { nombre, especialidad, titulacion } = context;
    const terapiasList = this._getTerapiasListForPrompt();

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

CATÁLOGO DE TERAPIAS RECONOCIDAS:
El documento debe acreditar formación en alguna de estas terapias (o similares): ${terapiasList}

INSTRUCCIONES DE ANÁLISIS:
1. Si el documento muestra formación en terapias holísticas/alternativas, es VÁLIDO
2. Verifica que sea legible y contenga información del curso/título
3. La entidad emitente puede ser una asociación, escuela o instituto de terapias alternativas
4. No seas muy estricto con el formato - acepta diplomas, certificados, constancias
5. Solo rechaza si claramente NO es un documento de formación (ej: factura, publicidad)
6. IDENTIFICA qué terapia(s) del catálogo se mencionan en el documento

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
  "terapiasDetectadas": ["array de nombres de terapias del catálogo que aparecen en el documento"],
  "terapiasCoincidenConDeclaradas": boolean,
  "camposDetectados": {
    "nombreTitulado": "string o null",
    "fechaEmision": "string o null",
    "numeroRegistro": "string o null"
  },
  "nivelConfianza": "alto|medio|bajo",
  "observaciones": "string (detalles importantes, incluir qué terapias se detectaron)",
  "recomendacion": "aceptar|revisar_manualmente|rechazar"
}

REGLAS CLAVE:
- Si el documento acredita formación en terapias alternativas/holísticas -> esTitulacionValida: true, recomendacion: "aceptar"
- Solo rechazar si es claramente falso, illegible o NO relacionado con formación
- Ante la duda -> aceptarlo (revisar_manualmente como máximo)
- En "terapiasDetectadas" incluye SOLO nombres de terapias que realmente aparecen en el documento
- "terapiasCoincidenConDeclaradas" debe ser true si alguna terapia detectada coincide con la especialidad declarada

IMPORTANTE: Responde ÚNICAMENTE con el JSON válido, sin texto adicional.`;
  }

  /**
   * Construye el prompt específico para análisis de PDFs
   */
  _buildPDFAnalysisPrompt(context) {
    const { nombre, especialidad, titulacion } = context;
    const terapiasList = this._getTerapiasListForPrompt();

    return `Analiza este DOCUMENTO PDF y determina si es un CERTIFICADO O TÍTULO DE FORMACIÓN válido para un TERAPEUTA HOLÍSTICO.

CONTEXTO DEL REGISTRO:
- Nombre del terapeuta: ${nombre || "No proporcionado"}
- Especialidad declarada: ${especialidad || "No proporcionada"}
- Título declarado: ${titulacion || "No proporcionado"}

IMPORTANTE: Este es un documento PDF que puede tener múltiples páginas. Por favor:
1. Revisa las páginas más relevantes que contengan la información principal del certificado
2. Ignora páginas de portada, índices o contenido no relacionado con la titulación
3. Busca la página que contenga: nombre del titulado, título/certificación, entidad emisora, fecha

TIPOS DE DOCUMENTOS VÁLIDOS para TERAPEUTAS HOLÍSTICOS/ALTERNATIVOS:
- Diplomas de escuelas de naturopatía, homeopatía, acupuntura
- Certificados de asociaciones de terapeutas (ATHHTA, etc.)
- Cursos de reprogramación mental, coaching transformacional
- Certificaciones de reiki, sanación cuántica, otras terapias alternativas
- Formación en coaching, PNL, programación neurolingüística
- Cualquier documento que acredite formación en terapias alternativas/complementarias

CATÁLOGO DE TERAPIAS RECONOCIDAS:
El documento debe acreditar formación en alguna de estas terapias (o similares): ${terapiasList}

INSTRUCCIONES DE ANÁLISIS PARA PDF:
1. Identifica las páginas que contienen información relevante del certificado/título
2. Si el documento muestra formación en terapias holísticas/alternativas, es VÁLIDO
3. Verifica que contenga información legible del curso/título
4. La entidad emitente puede ser una asociación, escuela o instituto
5. No seas muy estricto - acepta diplomas, certificados, constancias
6. Solo rechaza si claramente NO es un documento de formación
7. IDENTIFICA qué terapia(s) del catálogo se mencionan en el documento

RESPONSE FORMAT (JSON estricto):
{
  "esTitulacionValida": boolean,
  "tipoDocumento": "titulo_universitario|diploma_formacion|certificado_profesional|licencia_colegial|diploma_holistico|certificado_curso|otro",
  "nombreTitulo": "string (nombre exacto del título si es visible)",
  "entidadEmisora": "string (nombre de la universidad/institución/asociación)",
  "coincideEspecialidad": boolean,
  "terapiasDetectadas": ["array de nombres de terapias del catálogo que aparecen en el documento"],
  "terapiasCoincidenConDeclaradas": boolean,
  "camposDetectados": {
    "nombreTitulado": "string o null",
    "fechaEmision": "string o null",
    "numeroRegistro": "string o null"
  },
  "nivelConfianza": "alto|medio|bajo",
  "observaciones": "string (detalles importantes, incluir qué terapias se detectaron y si hay múltiples páginas)",
  "recomendacion": "aceptar|revisar_manualmente|rechazar"
}

REGLAS CLAVE:
- Si el documento acredita formación en terapias alternativas/holísticas -> esTitulacionValida: true, recomendacion: "aceptar"
- Solo rechazar si es claramente falso, illegible o NO relacionado con formación
- Ante la duda -> aceptarlo (revisar_manualmente como máximo)
- Para PDFs con múltiples páginas: mencionar en observaciones si todas las páginas son relevantes
- En "terapiasDetectadas" incluye SOLO nombres de terapias que realmente aparecen en el documento
- "terapiasCoincidenConDeclaradas" debe ser true si alguna terapia detectada coincide con la especialidad declarada

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

      // Procesar terapias detectadas
      let terapiasDetectadas = result.terapiasDetectadas || [];
      let terapiasCoincidenConDeclaradas = result.terapiasCoincidenConDeclaradas || false;

      // Si no vino terapias detectadas de la IA, intentar detectarlas manualmente
      if (terapiasDetectadas.length === 0 && result.nombreTitulo) {
        const matches = this.findMatchingTerapias(result.nombreTitulo + " " + result.observaciones);
        terapiasDetectadas = matches.map(m => m.nombre);
      }

      return {
        esTitulacionValida: result.esTitulacionValida,
        tipoDocumento: result.tipoDocumento || "desconocido",
        nombreTitulo: result.nombreTitulo || null,
        entidadEmisora: result.entidadEmisora || null,
        coincideEspecialidad: result.coincideEspecialidad || false,
        terapiasDetectadas: terapiasDetectadas,
        terapiasCoincidenConDeclaradas: terapiasCoincidenConDeclaradas,
        terapiasEnCatalogo: this.nombresTerapias.length > 0,
        totalTerapiasCatalogo: this.nombresTerapias.length,
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
        terapiasDetectadas: [],
        terapiasCoincidenConDeclaradas: false,
        terapiasEnCatalogo: this.nombresTerapias.length > 0,
        totalTerapiasCatalogo: this.nombresTerapias.length,
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
   * Analiza múltiples documentos de titulación (imágenes o PDFs)
   * @param {Array<{buffer: Buffer, mimeType: string}>} documents - Array de documentos
   * @param {Object} context - Contexto del registro
   * @returns {Promise<Array>} Resultados del análisis
   */
  async analyzeMultipleDegrees(documents, context = {}) {
    if (!Array.isArray(documents) || documents.length === 0) {
      throw new Error("Se requiere al menos un documento para analizar");
    }

    const results = [];

    for (let i = 0; i < documents.length; i++) {
      const { buffer, mimeType } = documents[i];
      const isPDF = mimeType === 'application/pdf';
      
      console.log(`📄 Procesando documento ${i + 1}/${documents.length}: ${isPDF ? 'PDF' : 'Imagen'}`);

      try {
        const analysis = await this.analyzeDegreeCertificate(buffer, mimeType, {
          ...context,
          indiceDocumento: i + 1,
          totalDocumentos: documents.length,
        });

        results.push({
          index: i,
          success: true,
          tipo: isPDF ? 'pdf' : 'imagen',
          ...analysis,
        });
      } catch (error) {
        results.push({
          index: i,
          success: false,
          tipo: isPDF ? 'pdf' : 'imagen',
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
