const { validationResult } = require('express-validator');
const { Document, Client, User } = require('../models');
const { supabase } = require('../config/supabase');
const { AppError } = require('../middleware/errorHandler');
const { formatFileSize } = require('../helpers/documentFormatters');

// Helper: fetch documents accessible to a client via junction table + direct client_id
async function fetchClientDocuments(clientId, options = {}) {
  const {
    category,
    type,
    sortBy = 'created_at',
    sortOrder = 'desc',
    limit = 20,
    offset = 0
  } = options;

  // Query 1: documents linked via document_clients junction table
  let junctionQuery = supabase
    .from('documents')
    .select('*, uploader:user_id(id, name, avatar, email), document_clients!inner(client_id)', { count: 'exact' })
    .eq('document_clients.client_id', clientId)
    .or('metadata->>status.is.null,metadata->>status.not.in.("deleted","archived")');

  // Query 2: documents where client_id matches directly (backward compatibility)
  let directQuery = supabase
    .from('documents')
    .select('*, uploader:user_id(id, name, avatar, email)', { count: 'exact' })
    .eq('client_id', clientId)
    .or('metadata->>status.is.null,metadata->>status.not.in.("deleted","archived")');

  if (category) {
    junctionQuery = junctionQuery.eq('category', category);
    directQuery = directQuery.eq('category', category);
  }
  if (type) {
    junctionQuery = junctionQuery.eq('type', type);
    directQuery = directQuery.eq('type', type);
  }

  const [junctionResult, directResult] = await Promise.all([
    junctionQuery,
    directQuery
  ]);

  // Merge and deduplicate
  const seenIds = new Set();
  let mergedData = [];

  for (const doc of (junctionResult.data || [])) {
    if (!seenIds.has(doc.id)) {
      seenIds.add(doc.id);
      mergedData.push(doc);
    }
  }
  for (const doc of (directResult.data || [])) {
    if (!seenIds.has(doc.id)) {
      seenIds.add(doc.id);
      mergedData.push(doc);
    }
  }

  const error = junctionResult.error || directResult.error;
  const totalCount = mergedData.length;

  // Sort
  const mappedSortBy = sortBy === 'createdAt' ? 'created_at' : sortBy;
  mergedData.sort((a, b) => {
    const aVal = a[mappedSortBy];
    const bVal = b[mappedSortBy];
    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1;
    }
    return aVal < bVal ? 1 : -1;
  });

  // Paginate
  const paginatedData = mergedData.slice(offset, offset + parseInt(limit));

  return { data: paginatedData, total: totalCount, error };
}

// Helper: check if a client can access a specific document
async function checkClientDocumentAccess(documentId, clientId) {
  // 1. Check metadata.sharedWith
  const document = await Document.findById(documentId);
  if (document && document.checkPermission(clientId, 'read')) {
    return document;
  }

  // 2. Check direct client_id
  const directDoc = await Document.findOne({ id: documentId, client_id: clientId });
  if (directDoc) {
    return directDoc;
  }

  // 3. Check document_clients junction table
  const { data: junctionDoc, error } = await supabase
    .from('documents')
    .select('*, document_clients!inner(client_id)')
    .eq('id', documentId)
    .eq('document_clients.client_id', clientId)
    .single();

  if (junctionDoc && !error) {
    return new Document.Document(junctionDoc);
  }

  return null;
}

const clientDocumentController = {
  // Get all documents shared with a client
  async getClientDocuments(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const clientId = req.user.id;
      const {
        page = 1,
        limit = 20,
        category,
        type,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      const offset = (parseInt(page) - 1) * parseInt(limit);

      const { data, total, error } = await fetchClientDocuments(clientId, {
        category,
        type,
        sortBy,
        sortOrder,
        limit: parseInt(limit),
        offset
      });

      if (error) throw new Error(error.message);

      // Fetch associated clients for each document
      const documentIds = data.map(d => d.id);
      let documentClientsMap = {};
      if (documentIds.length > 0) {
        const { data: docClients, error: docClientsError } = await supabase
          .from('document_clients')
          .select('document_id, client_id, clients(id, name, email, avatar)')
          .in('document_id', documentIds);

        if (!docClientsError) {
          documentClientsMap = (docClients || []).reduce((acc, dc) => {
            if (!acc[dc.document_id]) acc[dc.document_id] = [];
            acc[dc.document_id].push(dc.clients);
            return acc;
          }, {});
        }
      }

      const documents = data.map(d => {
        const doc = new Document.Document(d);
        const docJson = doc.toJSON();
        docJson.uploader = d.uploader || { name: 'Terapeuta' };
        const associatedClients = documentClientsMap[d.id] || [];
        docJson.clients = associatedClients.map(c => ({
          id: c.id,
          name: c.name,
          email: c.email,
          avatar: c.avatar
        }));
        docJson.client = associatedClients.length > 0 ? docJson.clients[0] : (d.client || null);
        return docJson;
      });

      res.json({
        success: true,
        data: {
          documents,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            total
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get a specific document for a client
  async getClientDocument(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { documentId } = req.params;
      const clientId = req.user.id;

      const document = await checkClientDocumentAccess(documentId, clientId);

      if (!document) {
        return next(new AppError('Document not found or access denied', 404));
      }

      // Track access
      await document.trackAccess(clientId, 'view');

      const responseData = document.toJSON();

      // Populate uploader
      const uploader = document.userId ? await User.findById(document.userId) : null;
      responseData.uploader = uploader ? {
        id: uploader.id,
        name: uploader.name,
        avatar: uploader.avatar
      } : { name: 'Terapeuta' };

      // Populate client
      if (document.clientId) {
        const client = await Client.findById(document.clientId);
        responseData.client = client ? {
          id: client.id,
          name: client.name,
          avatar: client.avatar,
          email: client.email
        } : null;
      }

      res.json({
        success: true,
        data: responseData
      });
    } catch (error) {
      next(error);
    }
  },

  // Download a document for a client
  async downloadClientDocument(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { documentId } = req.params;
      const clientId = req.user.id;

      const document = await checkClientDocumentAccess(documentId, clientId);

      if (!document) {
        return next(new AppError('Document not found or download not permitted', 403));
      }

      // Track download
      await document.trackAccess(clientId, 'download');

      // Redirect to Supabase Storage if available
      if (document.supabaseUrl) {
        return res.redirect(document.supabaseUrl);
      }

      // Fallback JSON response
      res.json({
        success: true,
        data: {
          downloadUrl: document.path || document.supabaseUrl || null,
          filename: document.originalName,
          size: document.size,
          type: document.mimeType
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get documents by category for a client
  async getClientDocumentsByCategory(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return next(new AppError('Validation failed', 400, errors.array()));
      }

      const { category } = req.params;
      const clientId = req.user.id;
      const {
        page = 1,
        limit = 20,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      const offset = (parseInt(page) - 1) * parseInt(limit);

      const { data, total, error } = await fetchClientDocuments(clientId, {
        category,
        sortBy,
        sortOrder,
        limit: parseInt(limit),
        offset
      });

      if (error) throw new Error(error.message);

      const documents = data.map(d => {
        const doc = new Document.Document(d);
        const docJson = doc.toJSON();
        docJson.uploader = d.uploader || { name: 'Terapeuta' };
        return docJson;
      });

      res.json({
        success: true,
        data: {
          documents,
          category,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            total
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  // Get recent documents for a client
  async getRecentClientDocuments(req, res, next) {
    try {
      const clientId = req.user.id;
      const { limit = 10 } = req.query;

      const { data, error } = await fetchClientDocuments(clientId, {
        sortBy: 'created_at',
        sortOrder: 'desc',
        limit: parseInt(limit),
        offset: 0
      });

      if (error) throw new Error(error.message);

      const documents = data.map(d => {
        const doc = new Document.Document(d);
        const docJson = doc.toJSON();
        docJson.uploader = d.uploader || { name: 'Terapeuta' };
        return docJson;
      });

      res.json({
        success: true,
        data: documents
      });
    } catch (error) {
      next(error);
    }
  },

  // Get document statistics for a client
  async getClientDocumentStats(req, res, next) {
    try {
      const clientId = req.user.id;

      const { data: junctionDocs, error: junctionError } = await supabase
        .from('documents')
        .select('id, category, type, size, metadata, document_clients!inner(client_id)')
        .eq('document_clients.client_id', clientId)
        .or('metadata->>status.is.null,metadata->>status.not.in.("deleted","archived")');

      const { data: directDocs, error: directError } = await supabase
        .from('documents')
        .select('id, category, type, size, metadata')
        .eq('client_id', clientId)
        .or('metadata->>status.is.null,metadata->>status.not.in.("deleted","archived")');

      if (junctionError) throw new Error(junctionError.message);
      if (directError) throw new Error(directError.message);

      // Merge and deduplicate
      const seenIds = new Set();
      const allDocs = [];
      for (const doc of (junctionDocs || [])) {
        if (!seenIds.has(doc.id)) {
          seenIds.add(doc.id);
          allDocs.push(doc);
        }
      }
      for (const doc of (directDocs || [])) {
        if (!seenIds.has(doc.id)) {
          seenIds.add(doc.id);
          allDocs.push(doc);
        }
      }

      const totalDocuments = allDocs.length;
      const totalSize = allDocs.reduce((sum, doc) => sum + (doc.size || 0), 0);

      const byCategory = {};
      const byType = {};

      allDocs.forEach(doc => {
        const cat = doc.category || 'other';
        byCategory[cat] = (byCategory[cat] || 0) + 1;

        const t = doc.type || 'other';
        byType[t] = (byType[t] || 0) + 1;
      });

      res.json({
        success: true,
        data: {
          totalDocuments,
          totalSize,
          humanTotalSize: formatFileSize(totalSize),
          byCategory,
          byType
        }
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = clientDocumentController;
