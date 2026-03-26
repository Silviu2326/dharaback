const { supabase } = require("../config/supabase");

const getTerapias = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("terapias_diccionario")
      .select("id, nombre")
      .order("nombre", { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      data: {
        total: data.length,
        especialidades: data,
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

    const { data, error } = await supabase
      .from("terapias_diccionario")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      return res.status(404).json({
        success: false,
        message: "Terapia no encontrada",
      });
    }

    res.json({
      success: true,
      data,
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

    const { data, error } = await supabase
      .from("terapias_diccionario")
      .select("id, nombre")
      .ilike("nombre", `%${q}%`)
      .order("nombre", { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      data: {
        total: data.length,
        resultados: data,
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

const getDiccionario = async (req, res) => {
  try {
    const { q } = req.query;

    let query = supabase
      .from("terapias_diccionario")
      .select("id, nombre, definicion, fundamento, que_trata, publico_recomendado, contraindicaciones, como_es_una_sesion, complementaria_con")
      .order("nombre", { ascending: true });

    if (q && q.length >= 2) {
      query = query.or(
        `nombre.ilike.%${q}%,definicion.ilike.%${q}%,que_trata.ilike.%${q}%,fundamento.ilike.%${q}%`
      );
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: {
        total: data.length,
        terapias: data,
      },
    });
  } catch (error) {
    console.error("Error obteniendo diccionario:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener el diccionario de terapias",
      error: error.message,
    });
  }
};

const createTerapia = async (req, res) => {
  try {
    const {
      nombre,
      definicion,
      fundamento,
      que_trata,
      publico_recomendado,
      contraindicaciones,
      como_es_una_sesion,
      complementaria_con,
    } = req.body;

    if (!nombre || !definicion) {
      return res.status(400).json({
        success: false,
        message: "El nombre y la definición son obligatorios",
      });
    }

    const { data, error } = await supabase
      .from("terapias_diccionario")
      .insert([
        {
          nombre,
          definicion,
          fundamento,
          que_trata,
          publico_recomendado,
          contraindicaciones,
          como_es_una_sesion,
          complementaria_con,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error creando terapia:", error);
    res.status(500).json({
      success: false,
      message: "Error al crear la terapia",
      error: error.message,
    });
  }
};

module.exports = {
  getTerapias,
  getTerapiaById,
  buscarTerapias,
  getDiccionario,
  createTerapia,
};
