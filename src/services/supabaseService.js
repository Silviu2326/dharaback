/**
 * Servicio Base de Supabase
 * Proporciona operaciones CRUD y utilidades para trabajar con PostgreSQL
 * Reemplaza las operaciones de Mongoose
 */

const { supabase } = require('../config/supabase');

class SupabaseService {
  constructor(tableName) {
    this.table = tableName;
    this.query = supabase.from(tableName);
  }

  /**
   * Crear un nuevo registro
   */
  async create(data) {
    const { data: result, error } = await supabase
      .from(this.table)
      .insert(data)
      .select()
      .single();

    if (error) throw new Error(`Error creating ${this.table}: ${error.message}`);
    return result;
  }

  /**
   * Crear múltiples registros
   */
  async createMany(dataArray) {
    const { data: result, error } = await supabase
      .from(this.table)
      .insert(dataArray)
      .select();

    if (error) throw new Error(`Error creating ${this.table}: ${error.message}`);
    return result;
  }

  /**
   * Buscar todos los registros con filtros opcionales
   */
  async findAll(options = {}) {
    let query = supabase.from(this.table).select(options.select || '*');

    // Aplicar filtros
    if (options.filters) {
      Object.entries(options.filters).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          query = query.in(key, value);
        } else if (typeof value === 'object' && value !== null) {
          // Soporte para operadores como { age: { gte: 18 } }
          Object.entries(value).forEach(([op, val]) => {
            switch (op) {
              case 'eq': query = query.eq(key, val); break;
              case 'neq': query = query.neq(key, val); break;
              case 'gt': query = query.gt(key, val); break;
              case 'gte': query = query.gte(key, val); break;
              case 'lt': query = query.lt(key, val); break;
              case 'lte': query = query.lte(key, val); break;
              case 'like': query = query.like(key, `%${val}%`); break;
              case 'ilike': query = query.ilike(key, `%${val}%`); break;
              case 'is': query = query.is(key, val); break;
              case 'in': query = query.in(key, val); break;
              case 'contains': query = query.contains(key, val); break;
              case 'containedBy': query = query.containedBy(key, val); break;
              case 'overlaps': query = query.overlaps(key, val); break;
            }
          });
        } else {
          query = query.eq(key, value);
        }
      });
    }

    // Aplicar ordenamiento
    if (options.order) {
      const { column, ascending = false } = options.order;
      query = query.order(column, { ascending });
    }

    // Aplicar paginación
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Error finding ${this.table}: ${error.message}`);
    return data || [];
  }

  /**
   * Buscar un registro por ID
   */
  async findById(id, options = {}) {
    const { data, error } = await supabase
      .from(this.table)
      .select(options.select || '*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // No rows found
      throw new Error(`Error finding ${this.table}: ${error.message}`);
    }
    return data;
  }

  /**
   * Buscar un registro por campo
   */
  async findOne(filters, options = {}) {
    let query = supabase.from(this.table).select(options.select || '*');

    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Error finding ${this.table}: ${error.message}`);
    }
    return data;
  }

  /**
   * Actualizar un registro por ID
   */
  async update(id, data) {
    const { data: result, error } = await supabase
      .from(this.table)
      .update(data)
      .eq('id', id)
      .select();

    if (error) throw new Error(`Error updating ${this.table}: ${error.message}`);
    if (!result || result.length === 0) throw new Error(`Error updating ${this.table}: Record not found`);
    return result[0];
  }

  /**
   * Actualizar múltiples registros
   */
  async updateMany(filters, data) {
    let query = supabase.from(this.table).update(data);

    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { data: result, error } = await query.select();

    if (error) throw new Error(`Error updating ${this.table}: ${error.message}`);
    return result;
  }

  /**
   * Eliminar un registro por ID
   */
  async delete(id) {
    const { data, error } = await supabase
      .from(this.table)
      .delete()
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Error deleting ${this.table}: ${error.message}`);
    return data;
  }

  /**
   * Eliminar múltiples registros
   */
  async deleteMany(filters) {
    let query = supabase.from(this.table).delete();

    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { data, error } = await query.select();

    if (error) throw new Error(`Error deleting ${this.table}: ${error.message}`);
    return data;
  }

  /**
   * Contar registros
   */
  async count(filters = {}) {
    let query = supabase.from(this.table).select('*', { count: 'exact', head: true });

    Object.entries(filters).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { count, error } = await query;

    if (error) throw new Error(`Error counting ${this.table}: ${error.message}`);
    return count;
  }

  /**
   * Buscar con paginación completa
   */
  async paginate(options = {}) {
    const page = options.page || 1;
    const limit = options.limit || 10;
    const offset = (page - 1) * limit;

    let query = supabase.from(this.table).select(options.select || '*', { count: 'exact' });

    // Aplicar filtros (igual que en findAll)
    if (options.filters) {
      Object.entries(options.filters).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          query = query.in(key, value);
        } else if (typeof value === 'object' && value !== null) {
          // Soporte para operadores como { date: { gte: '2024-01-01', lte: '2024-12-31' } }
          Object.entries(value).forEach(([op, val]) => {
            switch (op) {
              case 'eq':   query = query.eq(key, val); break;
              case 'neq':  query = query.neq(key, val); break;
              case 'gt':   query = query.gt(key, val); break;
              case 'gte':  query = query.gte(key, val); break;
              case 'lt':   query = query.lt(key, val); break;
              case 'lte':  query = query.lte(key, val); break;
              case 'like': query = query.like(key, `%${val}%`); break;
              case 'ilike':query = query.ilike(key, `%${val}%`); break;
              case 'is':   query = query.is(key, val); break;
              case 'in':   query = query.in(key, val); break;
            }
          });
        } else {
          query = query.eq(key, value);
        }
      });
    }

    // Aplicar ordenamiento
    if (options.order) {
      const { column, ascending = false } = options.order;
      query = query.order(column, { ascending });
    }

    // Aplicar rango
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) throw new Error(`Error paginating ${this.table}: ${error.message}`);

    return {
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    };
  }

  /**
   * Buscar con join (relaciones)
   */
  async findWithRelations(id, relations = []) {
    const selectFields = relations.map(rel => `
      *,
      ${rel}: ${rel}!inner(*)
    `).join(',\n');

    const { data, error } = await supabase
      .from(this.table)
      .select(selectFields || '*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Error finding ${this.table} with relations: ${error.message}`);
    }
    return data;
  }

  /**
   * Ejecutar RPC (funciones PostgreSQL)
   */
  async rpc(functionName, params = {}) {
    const { data, error } = await supabase.rpc(functionName, params);

    if (error) throw new Error(`Error executing ${functionName}: ${error.message}`);
    return data;
  }

  /**
   * Búsqueda de texto
   */
  async textSearch(column, queryText, options = {}) {
    let query = supabase
      .from(this.table)
      .select(options.select || '*')
      .textSearch(column, queryText);

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Error searching ${this.table}: ${error.message}`);
    return data || [];
  }

  /**
   * Buscar en rango de fechas
   */
  async findInDateRange(column, startDate, endDate, options = {}) {
    let query = supabase
      .from(this.table)
      .select(options.select || '*')
      .gte(column, startDate)
      .lte(column, endDate);

    if (options.filters) {
      Object.entries(options.filters).forEach(([key, value]) => {
        query = query.eq(key, value);
      });
    }

    if (options.order) {
      const { column: orderColumn, ascending = false } = options.order;
      query = query.order(orderColumn, { ascending });
    }

    const { data, error } = await query;

    if (error) throw new Error(`Error finding ${this.table} in date range: ${error.message}`);
    return data || [];
  }
}

module.exports = SupabaseService;
