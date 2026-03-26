const { supabase } = require("../config/supabase");

const approveDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { terapia_id } = req.body;

    const updatePayload = {
      status: "approved",
      reviewed_at: new Date().toISOString(),
    };

    if (terapia_id !== undefined) {
      updatePayload.terapia_id = terapia_id || null;
    }

    const { data, error } = await supabase
      .from("verification_documents")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Documento no encontrado",
      });
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error("Error aprobando documento:", error);
    res.status(500).json({
      success: false,
      message: "Error al aprobar el documento",
      error: error.message,
    });
  }
};

const getPendingDocuments = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("verification_documents")
      .select(
        `id, user_id, type, document_number, issuing_body, issue_date, expiry_date,
         status, file_url, notes, rejection_reason, created_at, updated_at,
         terapia_id, terapias_diccionario(nombre)`
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: {
        total: data.length,
        documents: data,
      },
    });
  } catch (error) {
    console.error("Error obteniendo documentos pendientes:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener los documentos pendientes",
      error: error.message,
    });
  }
};

module.exports = { getPendingDocuments, approveDocument };
