const { Document, Client, User } = require('../../models');
const { supabase } = require('../../config/supabase');
const { AppError } = require('../../middleware/errorHandler');

const listController = {
  // Get all documents for a therapist
  async getDocuments(req, res, next) {
    try {
      const therapistId = req.user.id;
      const userRole = req.user.role || req.user.type;
      
      console.log('🔍 BACKEND - Full req.user:', {
        id: req.user.id,
        role: req.user.role,
        type: req.user.type,
        hasToJSON: typeof req.user.toJSON
      });
      const {
        page = 1,
        limit = 20,
        category,
        clientId,
        status = 'active',
        type,
        tags,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      // DEBUG LOGS
      console.log('🔍 BACKEND getDocuments - USER:', {
        id: therapistId,
        role: userRole,
        queryClientId: clientId
      });

      // Build query with Supabase
      let query = supabase
        .from('documents')
        .select('*, client:client_id(*), uploader:user_id(*)', { count: 'exact' });

      // Filter out deleted/archived documents by default (checking metadata JSONB field)
      console.log('🔍 BACKEND - Filtering out deleted documents');
      query = query.or('metadata->>status.is.null,metadata->>status.not.in.("deleted","archived")');

      // Filter based on user role
      console.log('🔍 BACKEND - userRole check:', { userRole, isClient: userRole === 'client', isTherapist: userRole !== 'client' });
      
      if (userRole === 'client') {
        // Clients see documents shared with them through:
        // 1. document_clients junction table (multi-client support)
        // 2. client_id field in documents table (backward compatibility)
        console.log('🔍 BACKEND - PATH: CLIENT - Searching documents for client_id:', therapistId);
        
        // First query: documents linked via document_clients junction table
        let junctionQuery = supabase
          .from('documents')
          .select('*, client:client_id(*), uploader:user_id(*), document_clients!inner(client_id)', { count: 'exact' })
          .eq('document_clients.client_id', therapistId)
          .or('metadata->>status.is.null,metadata->>status.not.in.("deleted","archived")');
        
        // Second query: documents where client_id field matches directly (backward compatibility)
        let directQuery = supabase
          .from('documents')
          .select('*, client:client_id(*), uploader:user_id(*)', { count: 'exact' })
          .eq('client_id', therapistId)
          .or('metadata->>status.is.null,metadata->>status.not.in.("deleted","archived")');
        
        console.log('🔍 BACKEND - Executing both queries for client documents');
        
        // Execute both queries
        const [junctionResult, directResult] = await Promise.all([
          junctionQuery,
          directQuery
        ]);
        
        // Merge results and remove duplicates
        const junctionDocs = junctionResult.data || [];
        const directDocs = directResult.data || [];
        const seenIds = new Set();
        let mergedData = [];
        
        // Add junction documents first
        for (const doc of junctionDocs) {
          if (!seenIds.has(doc.id)) {
            seenIds.add(doc.id);
            mergedData.push(doc);
          }
        }
        
        // Add direct client_id documents (avoiding duplicates)
        for (const doc of directDocs) {
          if (!seenIds.has(doc.id)) {
            seenIds.add(doc.id);
            mergedData.push(doc);
          }
        }
        
        console.log('🔍 BACKEND - Junction query results:', junctionDocs.length);
        console.log('🔍 BACKEND - Direct query results:', directDocs.length);
        console.log('🔍 BACKEND - Merged unique results (before filters):', mergedData.length);
        
        // Apply category filter if provided
        if (category) {
          mergedData = mergedData.filter(doc => doc.category === category);
          console.log('🔍 BACKEND - After category filter:', mergedData.length);
        }
        
        // Apply type filter if provided
        if (type) {
          mergedData = mergedData.filter(doc => doc.type === type);
        }
        
        // Map frontend column names to Supabase column names
        const columnMap = {
          'uploadedAt': 'created_at',
          'updatedAt': 'updated_at',
          'title': 'title'
        };
        
        const mappedSortBy = columnMap[sortBy] || sortBy;
        
        // Apply sorting
        mergedData.sort((a, b) => {
          const aVal = a[mappedSortBy];
          const bVal = b[mappedSortBy];
          if (sortOrder === 'asc') {
            return aVal > bVal ? 1 : -1;
          } else {
            return aVal < bVal ? 1 : -1;
          }
        });
        
        // Apply pagination
        const totalCount = mergedData.length;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const paginatedData = mergedData.slice(offset, offset + parseInt(limit));
        
        console.log('🔍 BACKEND - Query executed for role:', userRole);
        console.log('🔍 BACKEND - Query results:', {
          dataLength: paginatedData.length,
          count: totalCount,
          error: (junctionResult.error || directResult.error)?.message || null
        });
        
        // Process documents for client (skip therapist-specific code below)
        const data = paginatedData;
        const count = totalCount;
        const error = junctionResult.error || directResult.error;
        
        if (error) throw new Error(error.message);
        
        // Get unique user_ids to fetch therapist info
        const userIds = [...new Set((data || []).map(d => d.user_id).filter(Boolean))];
        console.log('🔍 BACKEND - Unique user_ids from result:', userIds);
        
        // Fetch therapist information
        let therapistMap = {};
        if (userIds.length > 0) {
          const { data: therapists, error: therapistError } = await supabase
            .from('users')
            .select('id, name, email')
            .in('id', userIds);
          
          if (therapistError) {
            console.log('🔍 BACKEND - Error fetching therapists:', therapistError);
          } else {
            console.log('🔍 BACKEND - Found therapists:', therapists?.length || 0);
            therapistMap = (therapists || []).reduce((acc, t) => {
              acc[t.id] = t;
              return acc;
            }, {});
          }
        }

        // Get all document IDs to fetch associated clients from document_clients table
        const documentIds = (data || []).map(d => d.id);
        let documentClientsMap = {};
        
        if (documentIds.length > 0) {
          console.log('🔍 BACKEND - Fetching associated clients for', documentIds.length, 'documents');
          const { data: docClients, error: docClientsError } = await supabase
            .from('document_clients')
            .select('document_id, client_id, clients(id, name, email, avatar)')
            .in('document_id', documentIds);
          
          if (docClientsError) {
            console.log('🔍 BACKEND - Error fetching document_clients:', docClientsError);
          } else {
            console.log('🔍 BACKEND - Found document_client associations:', docClients?.length || 0);
            documentClientsMap = (docClients || []).reduce((acc, dc) => {
              if (!acc[dc.document_id]) {
                acc[dc.document_id] = [];
              }
              acc[dc.document_id].push(dc.clients);
              return acc;
            }, {});
          }
        }

        const documents = (data || []).map(d => {
          const doc = new Document.Document(d);
          const docJson = doc.toJSON();
          
          // Add therapist info
          const therapist = therapistMap[d.user_id];
          docJson.uploader = therapist ? {
            id: therapist.id,
            name: therapist.name,
            email: therapist.email
          } : { name: 'Terapeuta' };
          
          // Add all associated clients from document_clients table
          const associatedClients = documentClientsMap[d.id] || [];
          docJson.clients = associatedClients.map(client => ({
            id: client.id,
            name: client.name,
            email: client.email,
            avatar: client.avatar
          }));
          
          // Keep backward compatibility with single client field
          docJson.client = associatedClients.length > 0 ? docJson.clients[0] : (d.client || null);
          
          return docJson;
        });
        
        console.log('🔍 BACKEND - Returning documents count for client:', documents.length);

        return res.json({
          success: true,
          data: {
            documents: documents,
            pagination: {
              current: parseInt(page),
              pages: Math.ceil((count || 0) / parseInt(limit)),
              total: count || 0
            }
          }
        });
      } else {
        // Therapists see their own documents
        console.log('🔍 BACKEND - PATH: THERAPIST - Filtering by user_id:', therapistId);
        console.log('🔍 BACKEND - EXACT therapistId type:', typeof therapistId, therapistId);
        query = query.eq('user_id', therapistId);
        console.log('🔍 BACKEND - Query after user_id filter applied');
      }

      if (category) {
        console.log('🔍 BACKEND - Adding category filter:', category);
        query = query.eq('category', category);
      }
      if (clientId && userRole !== 'client') {
        console.log('🔍 BACKEND - Adding clientId filter:', clientId);
        query = query.eq('client_id', clientId);
      }
      if (type) query = query.eq('type', type);
      if (tags) {
        const tagArray = tags.split(',').map(tag => tag.trim());
        query = query.overlaps('tags', tagArray);
      }

      // Map frontend column names to Supabase column names
      const columnMap = {
        'uploadedAt': 'created_at',
        'updatedAt': 'updated_at',
        'title': 'title'
      };
      
      const mappedSortBy = columnMap[sortBy] || sortBy;
      
      // Apply sorting and pagination
      query = query.order(mappedSortBy, { ascending: sortOrder === 'asc' });
      
      const offset = (parseInt(page) - 1) * parseInt(limit);
      query = query.range(offset, offset + parseInt(limit) - 1);

      const { data, error, count } = await query;

      console.log('🔍 BACKEND - Query executed for role:', userRole);
      console.log('🔍 BACKEND - Query results:', {
        dataLength: data?.length || 0,
        count: count || 0,
        error: error?.message || null
      });
      
      if (userRole === 'client' && data && data.length > 0) {
        console.log('🔍 BACKEND - CLIENT VIEW - First document clients:', 
          JSON.stringify(data[0].document_clients));
      }

      if (error) throw new Error(error.message);

      // DETAILED LOG: Show first 3 documents raw user_ids
      console.log('🔍 BACKEND - RAW DATA first 3 documents:', JSON.stringify(data?.slice(0, 3).map(d => ({ id: d.id, user_id: d.user_id, title: d.title }))));

      // Get unique user_ids to fetch therapist info
      const userIds = [...new Set((data || []).map(d => d.user_id).filter(Boolean))];
      console.log('🔍 BACKEND - Unique user_ids from result:', userIds);
      console.log('🔍 BACKEND - therapistId being used for filter:', therapistId, 'type:', typeof therapistId);
      
      // Fetch therapist information
      let therapistMap = {};
      if (userIds.length > 0) {
        const { data: therapists, error: therapistError } = await supabase
          .from('users')
          .select('id, name, email')
          .in('id', userIds);
        
        if (therapistError) {
          console.log('🔍 BACKEND - Error fetching therapists:', therapistError);
        } else {
          console.log('🔍 BACKEND - Found therapists:', therapists?.length || 0);
          therapistMap = (therapists || []).reduce((acc, t) => {
            acc[t.id] = t;
            return acc;
          }, {});
        }
      }

      // Get all document IDs to fetch associated clients from document_clients table
      const documentIds = (data || []).map(d => d.id);
      let documentClientsMap = {};
      
      if (documentIds.length > 0) {
        console.log('🔍 BACKEND - Fetching associated clients for', documentIds.length, 'documents');
        const { data: docClients, error: docClientsError } = await supabase
          .from('document_clients')
          .select('document_id, client_id, clients(id, name, email, avatar)')
          .in('document_id', documentIds);
        
        if (docClientsError) {
          console.log('🔍 BACKEND - Error fetching document_clients:', docClientsError);
        } else {
          console.log('🔍 BACKEND - Found document_client associations:', docClients?.length || 0);
          // Group clients by document_id
          documentClientsMap = (docClients || []).reduce((acc, dc) => {
            if (!acc[dc.document_id]) {
              acc[dc.document_id] = [];
            }
            acc[dc.document_id].push(dc.clients);
            return acc;
          }, {});
        }
      }

      const documents = (data || []).map(d => {
        const doc = new Document.Document(d);
        const docJson = doc.toJSON();
        
        // Add therapist info
        const therapist = therapistMap[d.user_id];
        docJson.uploader = therapist ? {
          id: therapist.id,
          name: therapist.name,
          email: therapist.email
        } : { name: 'Terapeuta' };
        
        // Add all associated clients from document_clients table
        const associatedClients = documentClientsMap[d.id] || [];
        docJson.clients = associatedClients.map(client => ({
          id: client.id,
          name: client.name,
          email: client.email,
          avatar: client.avatar
        }));
        
        // Keep backward compatibility with single client field
        docJson.client = associatedClients.length > 0 ? docJson.clients[0] : null;
        
        return docJson;
      });
      
      console.log('🔍 BACKEND - Returning documents count:', documents.length);

      res.json({
        success: true,
        data: {
          documents: documents,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil((count || 0) / parseInt(limit)),
            total: count || 0
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get a specific document
  async getDocument(req, res, next) {
    try {
      const { documentId } = req.params;
      const userId = req.user.id;

      const document = await Document.findById(documentId);

      if (!document) {
        return next(new AppError('Document not found', 404));
      }

      // Check permissions
      const hasAccess = document.userId === userId ||
                       document.checkPermission(userId, 'read');

      if (!hasAccess) {
        return next(new AppError('Access denied', 403));
      }

      // Track access
      await document.trackAccess(userId, 'view');

      // Fetch related data
      const [client, uploader] = await Promise.all([
        document.clientId ? Client.findById(document.clientId) : null,
        User.findById(document.userId)
      ]);

      const responseData = document.toJSON();
      responseData.client = client ? {
        id: client.id,
        name: client.name,
        avatar: client.avatar,
        email: client.email
      } : null;
      responseData.uploader = uploader ? {
        id: uploader.id,
        name: uploader.name,
        avatar: uploader.avatar
      } : null;

      res.json({
        success: true,
        data: responseData
      });
    } catch (error) {
      next(error);
    }
  },

  // Get documents by category
  async getDocumentsByCategory(req, res, next) {
    try {
      const { category } = req.params;
      const therapistId = req.user.id;
      const { clientId, page = 1, limit = 20 } = req.query;

      const filters = { user_id: therapistId, category };
      if (clientId) filters.client_id = clientId;

      const documents = await Document.getByCategory(therapistId, category, {
        filters: clientId ? { client_id: clientId } : undefined,
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit)
      });

      const { count } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', therapistId)
        .eq('category', category)
        .eq('metadata->>status', 'active');

      res.json({
        success: true,
        data: {
          documents: documents.map(d => d.toJSON()),
          category,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil((count || 0) / parseInt(limit)),
            total: count || 0
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Search documents
  async searchDocuments(req, res, next) {
    try {
      const { q: searchQuery, category, type, clientId } = req.query;
      const therapistId = req.user.id;

      const filters = {};
      if (category) filters.category = category;
      if (type) filters.type = type;
      if (clientId) filters.client_id = clientId;

      const documents = await Document.searchDocuments(therapistId, searchQuery, {
        filters
      });

      res.json({
        success: true,
        data: {
          documents: documents.map(d => d.toJSON()),
          searchQuery,
          filters
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get recent documents
  async getRecentDocuments(req, res, next) {
    try {
      const therapistId = req.user.id;
      const { limit = 10 } = req.query;

      const documents = await Document.find({
        filters: { user_id: therapistId },
        orderBy: 'created_at',
        ascending: false,
        limit: parseInt(limit)
      });

      // Populate client and uploader data
      const populatedDocuments = await Promise.all(
        documents.map(async (doc) => {
          const [client, uploader] = await Promise.all([
            doc.clientId ? Client.findById(doc.clientId) : null,
            User.findById(doc.userId)
          ]);
          
          const docData = doc.toJSON();
          docData.client = client ? {
            id: client.id,
            name: client.name,
            avatar: client.avatar
          } : null;
          docData.uploader = uploader ? {
            id: uploader.id,
            name: uploader.name,
            avatar: uploader.avatar
          } : null;
          
          return docData;
        })
      );

      res.json({
        success: true,
        data: populatedDocuments
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = listController;
