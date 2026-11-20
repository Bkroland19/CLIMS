window.addEventListener("load", function () {
  window.ui = SwaggerUIBundle({
    url: "./openapi.json",
    dom_id: "#swagger-ui",
    deepLinking: true,
    // Kept in page memory only: a reload signs the docs out.
    persistAuthorization: false,
    validatorUrl: null,
    // Every operation opens ready to edit and execute against this API.
    tryItOutEnabled: true,
    supportedSubmitMethods: ["get", "post", "put", "patch", "delete"],
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    // A successful login or refresh authorizes the page with its token, so protected calls work straight away.
    responseInterceptor: function (response) {
      try {
        var token =
          response.ok &&
          /\/api\/v1\/auth\/(login|refresh)$/.test(new URL(response.url, location.href).pathname)
            ? response.body && response.body.data && response.body.data.token
            : null;
        if (token) window.ui.preauthorizeApiKey("bearerAuth", token);
      } catch (error) {
        console.warn("Could not authorize Swagger UI from the response", error);
      }
      return response;
    },
    presets: [SwaggerUIBundle.presets.apis],
    layout: "BaseLayout",
  });
});
