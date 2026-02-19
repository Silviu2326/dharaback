const AutoResponse = require("../models/supabase/AutoResponse");

const defaultResponses = {
  1: "Lamentamos profundamente que tu experiencia no haya sido la esperada. Nos gustaría entender mejor qué ocurrió para poder mejorar. Por favor, contáctanos directamente para poder atender tu caso personalmente.",
  2: "Gracias por tus comentarios. Sentimos que no hayamos cumplido totalmente con tus expectativas. Tomaremos muy en cuenta tus observaciones para mejorar nuestros servicios en el futuro.",
  3: "Gracias por tu reseña. Nos alegra que hayas compartido tu opinión con nosotros. Siempre buscamos mejorar y tus comentarios son muy valiosos para nuestro crecimiento.",
  4: "¡Muchas gracias por tu buena valoración! Nos alegra mucho saber que tuviste una experiencia positiva con nosotros. Esperamos poder atenderte de nuevo pronto.",
  5: "¡Muchísimas gracias por tu excelente valoración! Nos hace muy felices saber que estás satisfecho con nuestro servicio. ¡Es un verdadero placer atenderte!",
};

exports.getAutoResponses = async (req, res) => {
  try {
    let responses = await AutoResponse.getAll();

    if (!responses || responses.length === 0) {
      for (let i = 1; i <= 5; i++) {
        await AutoResponse.upsert(i, defaultResponses[i]);
      }
      responses = await AutoResponse.getAll();
    }

    const responseMap = {};
    responses.forEach((r) => {
      responseMap[r.rating] = r.message;
    });

    res.json({
      success: true,
      data: responseMap,
    });
  } catch (error) {
    console.error("Error getting auto responses:", error);
    res.status(500).json({
      success: false,
      error: "Error al obtener las respuestas automáticas",
    });
  }
};

exports.updateAutoResponse = async (req, res) => {
  try {
    const { rating, message } = req.body;

    if (!rating || !message) {
      return res.status(400).json({
        success: false,
        error: "Rating y message son requeridos",
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: "Rating debe estar entre 1 y 5",
      });
    }

    if (message.length > 800) {
      return res.status(400).json({
        success: false,
        error: "El mensaje no puede exceder 800 caracteres",
      });
    }

    const response = await AutoResponse.upsert(rating, message);

    res.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("Error updating auto response:", error);
    res.status(500).json({
      success: false,
      error: "Error al actualizar la respuesta automática",
    });
  }
};

exports.resetAutoResponse = async (req, res) => {
  try {
    const { rating } = req.params;
    const ratingNum = parseInt(rating);

    if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({
        success: false,
        error: "Rating inválido",
      });
    }

    const response = await AutoResponse.upsert(
      ratingNum,
      defaultResponses[ratingNum],
    );

    res.json({
      success: true,
      data: response,
      message: "Respuesta restaurada al valor por defecto",
    });
  } catch (error) {
    console.error("Error resetting auto response:", error);
    res.status(500).json({
      success: false,
      error: "Error al restaurar la respuesta automática",
    });
  }
};

exports.resetAllAutoResponses = async (req, res) => {
  try {
    for (let i = 1; i <= 5; i++) {
      await AutoResponse.upsert(i, defaultResponses[i]);
    }

    res.json({
      success: true,
      message: "Todas las respuestas han sido restauradas al valor por defecto",
    });
  } catch (error) {
    console.error("Error resetting all auto responses:", error);
    res.status(500).json({
      success: false,
      error: "Error al restaurar las respuestas automáticas",
    });
  }
};
