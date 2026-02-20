const fs = require("fs").promises;
const path = require("path");

const getTerapiasPath = async () => {
  const possiblePaths = [
    path.join(__dirname, "../data/terapias.json"),
    path.join(__dirname, "../../data/terapias.json"),
    path.join(process.cwd(), "src/data/terapias.json"),
    "/app/src/data/terapias.json",
  ];
  
  for (const p of possiblePaths) {
    try {
      await fs.access(p);
      console.log("✓ Terapias encontradas en:", p);
      return p;
    } catch {
      console.log("✗ No encontrado en:", p);
      continue;
    }
  }
  
  return possiblePaths[0];
};

const getTerapias = async (req, res) => {
  try {
    const terapiasPath = await getTerapiasPath();
    console.log("Cargando terapias desde:", terapiasPath);
    const data = await fs.readFile(terapiasPath, "utf-8");
    const terapiasData = JSON.parse(data);

    const especialidades = terapiasData.terapias.map((t) => ({
      id: t.id,
      nombre: t.nombre,
      descripcion_corta: t.descripcion_corta,
    }));

    res.json({
      success: true,
      data: {
        total: especialidades.length,
        especialidades,
      },
    });
  } catch (error) {
    console.error("Error leyendo terapias:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener las terapias",
      error: error.message,
    });
  }
};

const getTerapiaById = async (req, res) => {
  try {
    const { id } = req.params;
    const terapiasPath = await getTerapiasPath();
    const data = await fs.readFile(terapiasPath, "utf-8");
    const terapiasData = JSON.parse(data);

    const terapia = terapiasData.terapias.find((t) => t.id === parseInt(id));

    if (!terapia) {
      return res.status(404).json({
        success: false,
        message: "Terapia no encontrada",
      });
    }

    res.json({
      success: true,
      data: terapia,
    });
  } catch (error) {
    console.error("Error obteniendo terapia:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener la terapia",
      error: error.message,
    });
  }
};

const buscarTerapias = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        message: "La búsqueda debe tener al menos 2 caracteres",
      });
    }

    const terapiasPath = await getTerapiasPath();
    const data = await fs.readFile(terapiasPath, "utf-8");
    const terapiasData = JSON.parse(data);

    const termino = q.toLowerCase();
    const resultados = terapiasData.terapias
      .filter(
        (t) =>
          t.nombre.toLowerCase().includes(termino) ||
          t.descripcion_corta.toLowerCase().includes(termino),
      )
      .map((t) => ({
        id: t.id,
        nombre: t.nombre,
        descripcion_corta: t.descripcion_corta,
      }));

    res.json({
      success: true,
      data: {
        total: resultados.length,
        resultados,
      },
    });
  } catch (error) {
    console.error("Error buscando terapias:", error);
    res.status(500).json({
      success: false,
      message: "Error al buscar terapias",
      error: error.message,
    });
  }
};

module.exports = {
  getTerapias,
  getTerapiaById,
  buscarTerapias,
};
