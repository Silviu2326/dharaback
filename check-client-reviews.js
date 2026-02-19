const mongoose = require('mongoose');
require('dotenv').config();

// Import models
const Client = require('./src/models/Client');
const Review = require('./src/models/Review');
const User = require('./src/models/User');

const checkClientReviews = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/dharaterapeutas');
    console.log('✅ Connected to MongoDB');

    // Find client by email
    const client = await Client.findOne({ email: 'cliente@ejemplo.com' });

    if (!client) {
      console.log('❌ Client not found with email: cliente@ejemplo.com');
      return;
    }

    console.log('✅ Client found:', {
      id: client._id,
      email: client.email,
      name: client.name,
      status: client.status
    });

    // Find all reviews by this client
    const reviews = await Review.find({ clientId: client._id })
      .populate('therapist', 'name email specialties')
      .populate('booking', 'date status')
      .sort({ createdAt: -1 });

    console.log(`\n📝 Found ${reviews.length} review(s) by this client:`);

    if (reviews.length === 0) {
      console.log('📝 No reviews found for this client');

      // Let's also check all reviews in the database
      const allReviews = await Review.find({}).populate('clientId', 'email name');
      console.log(`\n📊 Total reviews in database: ${allReviews.length}`);

      if (allReviews.length > 0) {
        console.log('📋 All reviews in database:');
        allReviews.forEach((review, index) => {
          console.log(`${index + 1}. Client: ${review.clientId?.email || 'Unknown'} | Rating: ${review.rating} | Title: "${review.title}"`);
        });
      }
    } else {
      reviews.forEach((review, index) => {
        console.log(`\n--- Review ${index + 1} ---`);
        console.log('ID:', review._id);
        console.log('Rating:', review.rating);
        console.log('Title:', review.title);
        console.log('Comment:', review.comment);
        console.log('Therapist:', review.therapist?.name || 'Unknown');
        console.log('Date:', review.createdAt);
        console.log('Is Public:', review.isPublic);
        console.log('Is Verified:', review.isVerified);
        console.log('Moderation Status:', review.moderationStatus);
        console.log('Sentiment:', review.sentiment);
        console.log('Has Response:', review.hasResponse);
        if (review.response) {
          console.log('Response:', review.response);
          console.log('Response Date:', review.responseDate);
        }
      });
    }

    // Also check client stats
    console.log(`\n📈 Client Review Stats:`);
    console.log('Total reviews written:', reviews.length);

    if (reviews.length > 0) {
      const avgRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
      const publicReviews = reviews.filter(r => r.isPublic).length;
      const verifiedReviews = reviews.filter(r => r.isVerified).length;

      console.log('Average rating given:', avgRating.toFixed(1));
      console.log('Public reviews:', publicReviews);
      console.log('Verified reviews:', verifiedReviews);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
};

checkClientReviews();