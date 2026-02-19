const { supabase } = require("./src/config/supabase");

const createAutoResponsesTable = async () => {
  console.log("Creating auto_responses table...");

  try {
    // Check if table exists
    const { error: checkError } = await supabase
      .from("auto_responses")
      .select("id", { count: "exact", head: true });

    if (!checkError) {
      console.log("Table auto_responses already exists");
      return;
    }

    // Table doesn't exist, we need to create it
    // Using raw SQL through postgrest
    const { data, error } = await supabase.rpc("pg_catalog.exec", {
      sql: `
        CREATE TABLE IF NOT EXISTS auto_responses (
          id SERIAL PRIMARY KEY,
          rating INTEGER NOT NULL UNIQUE,
          message TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        INSERT INTO auto_responses (rating, message) VALUES
          (1, 'Lamentamos profundamente que tu experiencia no haya sido la esperada. Nos gustaría entender mejor qué ocurrió para poder mejorar. Por favor, contáctanos directamente para poder atender tu caso personalmente.'),
          (2, 'Gracias por tus comentarios. Sentimos que no hayamos cumplido totalmente con tus expectativas. Tomaremos muy en cuenta tus observaciones para mejorar nuestros servicios en el futuro.'),
          (3, 'Gracias por tu reseña. Nos alegra que hayas compartido tu opinión con nosotros. Siempre buscamos mejorar y tus comentarios son muy valiosos para nuestro crecimiento.'),
          (4, '¡Muchas gracias por tu buena valoración! Nos alegra mucho saber que tuviste una experiencia positiva con nosotros. Esperamos poder atenderte de nuevo pronto.'),
          (5, '¡Muchísimas gracias por tu excelente valoración! Nos hace muy felices saber que estás satisfecho con nuestro servicio. ¡Es un verdadero placer atenderte!')
        ON CONFLICT (rating) DO NOTHING;
      `,
    });

    if (error) {
      console.error("Error creating table:", error);
    } else {
      console.log("Table auto_responses created successfully");
    }
  } catch (err) {
    console.error("Exception:", err);
  }

  process.exit(0);
};

createAutoResponsesTable();
