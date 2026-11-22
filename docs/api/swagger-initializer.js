window.addEventListener("load", function () {
  window.ui = SwaggerUIBundle(
    window.climsSwaggerOptions({ url: "./openapi.json", dom_id: "#swagger-ui" }),
  );
});
