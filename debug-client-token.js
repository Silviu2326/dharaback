const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Import models
const Client = require('./src/models/Client');

const debugClientToken = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dharaterapeutas');
    console.log('✅ Connected to MongoDB');

    const clientId = '68d6124b517bffb225f8b1f2';
    console.log('🔍 Looking for client with ID:', clientId);

    // Check if client exists
    const client = await Client.findById(clientId);

    if (!client) {
      console.log('❌ Client not found with ID:', clientId);

      // Let's check all clients
      const allClients = await Client.find({}, 'email name status');
      console.log('📋 All clients in database:', allClients);

      // Try to find client by email
      const clientByEmail = await Client.findOne({ email: 'cliente@ejemplo.com' });
      if (clientByEmail) {
        console.log('✅ Found client by email:', clientByEmail._id.toString());
        console.log('📄 Client details:', {
          id: clientByEmail._id,
          email: clientByEmail.email,
          name: clientByEmail.name,
          status: clientByEmail.status
        });

        // Generate new token for this client
        if (clientByEmail.status === 'active') {
          const token = jwt.sign(
            {
              id: clientByEmail._id.toString(),
              type: 'client',
              email: clientByEmail.email
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
          );

          console.log('🔐 New valid token:', token);
        } else {
          console.log('⚠️  Client status is not active:', clientByEmail.status);
        }
      } else {
        console.log('❌ No client found with email: cliente@ejemplo.com');
      }
    } else {
      console.log('✅ Client found:', {
        id: client._id,
        email: client.email,
        name: client.name,
        status: client.status
      });

      // Generate new token
      if (client.status === 'active') {
        const token = jwt.sign(
          {
            id: client._id.toString(),
            type: 'client',
            email: client.email
          },
          process.env.JWT_SECRET,
          { expiresIn: '7d' }
        );

        console.log('🔐 New valid token:', token);
      } else {
        console.log('⚠️  Client status is not active:', client.status);
      }
    }

    // Also check if there are any documents for this client
    const Document = require('./src/models/Document');
    const documents = await Document.find({
      $or: [
        { 'permissions.canView.userId': new mongoose.Types.ObjectId(clientId) },
        { visibility: 'client_shared', clientId: new mongoose.Types.ObjectId(clientId) }
      ]
    });

    console.log('📄 Documents accessible by this client:', documents.length);
    if (documents.length > 0) {
      console.log('📄 First document:', {
        id: documents[0]._id,
        title: documents[0].title,
        visibility: documents[0].visibility
      });
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
};

debugClientToken();