const responseSuccess = (data) => {
  return {
    success: true,
    data,
  };
};

const responseError = (message, statusCode = 500) => {
  return {
    success: false,
    error: {
      message,
      statusCode,
    },
  };
};

module.exports = {
  responseSuccess,
  responseError,
};
