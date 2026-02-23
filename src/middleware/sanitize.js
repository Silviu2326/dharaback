const sanitizeHtml = require('sanitize-html');

const defaultOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'ul', 'ol', 'li',
    'strong', 'em', 'b', 'i', 'u', 's', 'strike',
    'a', 'img',
    'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'span', 'div'
  ],
  allowedAttributes: {
    'a': ['href', 'title', 'target', 'rel'],
    'img': ['src', 'alt', 'title', 'width', 'height'],
    '*': ['class', 'id', 'style']
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: {
    'a': (tagName, attribs) => {
      if (attribs.href && attribs.href.startsWith('javascript:')) {
        return { tagName: 'span', attribs: {} };
      }
      return { tagName, attribs };
    }
  }
};

const sanitizeString = (input) => {
  if (typeof input !== 'string') return input;
  return sanitizeHtml(input, defaultOptions);
};

const sanitizeObject = (obj) => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj);
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const key in obj) {
      sanitized[key] = sanitizeObject(obj[key]);
    }
    return sanitized;
  }
  return obj;
};

const sanitizeInput = (req, res, next) => {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }
  next();
};

const sanitizeField = (field) => {
  return (req, res, next) => {
    if (req.body && req.body[field]) {
      req.body[field] = sanitizeString(req.body[field]);
    }
    next();
  };
};

module.exports = {
  sanitizeInput,
  sanitizeField,
  sanitizeString,
  sanitizeObject,
  defaultOptions
};
