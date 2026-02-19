const { supabase } = require("../../config/supabase");

const DEFAULT_RESPONSES = {
  1: "Lamentamos profundamente que tu experiencia no haya sido la esperada. Nos gustaría entender mejor qué ocurrió para poder mejorar. Por favor, contáctanos directamente para poder atender tu caso personalmente.",
  2: "Gracias por tus comentarios. Sentimos que no hayamos cumplido totalmente con tus expectativas. Tomaremos muy en cuenta tus observaciones para mejorar nuestros servicios en el futuro.",
  3: "Gracias por tu reseña. Nos alegra que hayas compartido tu opinión con nosotros. Siempre buscamos mejorar y tus comentarios son muy valiosos para nuestro crecimiento.",
  4: "¡Muchas gracias por tu buena valoración! Nos alegra mucho saber que tuviste una experiencia positiva con nosotros. Esperamos poder atenderte de nuevo pronto.",
  5: "¡Muchísimas gracias por tu excelente valoración! Nos hace muy felices saber que estás satisfecho con nuestro servicio. ¡Es un verdadero placer atenderte!",
};

class AutoResponse {
  static tableName = "auto_responses";

  static async ensureTable() {
    try {
      const { error: checkError } = await supabase
        .from(this.tableName)
        .select("rating", { count: "exact", head: true });

      if (checkError && checkError.code === "PGRST116") {
        const { error: createError } = await supabase.rpc(
          "create_auto_responses_table",
          {},
        );
        if (createError) {
          await this.createTableManually();
        }
      }
    } catch (error) {
      console.log("AutoResponse table does not exist, creating...");
      await this.createTableManually();
    }
  }

  static async createTableManually() {
    const createSQL = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id SERIAL PRIMARY KEY,
        rating INTEGER NOT NULL UNIQUE,
        message TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      INSERT INTO ${this.tableName} (rating, message) VALUES
        (1, '${DEFAULT_RESPONSES[1]}'),
        (2, '${DEFAULT_RESPONSES[2]}'),
        (3, '${DEFAULT_RESPONSES[3]}'),
        (4, '${DEFAULT_RESPONSES[4]}'),
        (5, '${DEFAULT_RESPONSES[5]}')
      ON CONFLICT (rating) DO NOTHING;
    `;

    const { error } = await supabase.rpc("exec_sql", { sql: createSQL });
    if (error) {
      console.log("Using alternative table creation method");
    }
  }

  static async getAll() {
    const { data, error } = await supabase
      .from(this.tableName)
      .select("*")
      .order("rating", { ascending: true });

    if (error) {
      console.error("Error fetching auto responses:", error);
      if (error.code === "PGRST116") {
        await this.ensureTable();
        return this.getAll();
      }
      throw error;
    }
    return data || [];
  }

  static async getByRating(rating) {
    const { data, error } = await supabase
      .from(this.tableName)
      .select("*")
      .eq("rating", rating)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data;
  }

  static async upsert(rating, message) {
    const { data, error } = await supabase
      .from(this.tableName)
      .upsert(
        {
          rating,
          message,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "rating",
          returning: "representation",
        },
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  static async create(rating, message) {
    const { data, error } = await supabase
      .from(this.tableName)
      .insert({ rating, message })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

module.exports = AutoResponse;
