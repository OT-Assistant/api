export const openapiSpec = {
  openapi: "3.0.0",
  info: {
    title: "OT Assistant API Docs",
    version: "1.0.0",
    description: "API documentation for the OT Assistant occupational therapy application. Supports local developer bypass headers."
  },
  servers: [
    {
      url: "http://localhost:8787",
      description: "Local Development Server"
    },
    {
      url: "https://ot-api-dev.otconnect.ir",
      description: "Production Server"
    }
  ],
  components: {
    securitySchemes: {
      clerkAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Clerk Session JWT token."
      },
      devBypassHeader: {
        type: "apiKey",
        in: "header",
        name: "X-Dev-User",
        description: "Local development bypass header. Set to 'therapist', 'client', or 'admin' to bypass Clerk authorization."
      }
    }
  },
  security: [
    {
      clerkAuth: [],
      devBypassHeader: []
    }
  ],
  paths: {
    "/health": {
      "get": {
        "summary": "Health check",
        "responses": {
          "200": {
            "description": "API is healthy"
          }
        }
      }
    },
    "/api/v1/me": {
      "get": {
        "summary": "Get logged-in user profile",
        "responses": {
          "200": {
            "description": "User profile retrieved successfully"
          }
        }
      },
      "post": {
        "summary": "Sync user profile",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "name": { "type": "string" },
                  "email": { "type": "string" }
                },
                "required": ["name", "email"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "User synced successfully"
          }
        }
      }
    },
    "/api/v1/me/role": {
      "put": {
        "summary": "Update user role",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "role": { "type": "string", "enum": ["therapist", "client", "none"] }
                },
                "required": ["role"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Role updated successfully"
          }
        }
      }
    },
    "/api/v1/clients": {
      "get": {
        "summary": "List all clients",
        "responses": {
          "200": {
            "description": "List of clients"
          }
        }
      },
      "post": {
        "summary": "Create a new client",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "display_name": { "type": "string" },
                  "email": { "type": "string" },
                  "notes": { "type": "string" }
                },
                "required": ["display_name", "email"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Client created successfully"
          }
        }
      }
    },
    "/api/v1/clients/{id}": {
      "get": {
        "summary": "Get a specific client by ID",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": { "type": "string" }
          }
        ],
        "responses": {
          "200": {
            "description": "Client profile details"
          }
        }
      },
      "put": {
        "summary": "Update a client's profile",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": { "type": "string" }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "display_name": { "type": "string" },
                  "email": { "type": "string" },
                  "notes": { "type": "string" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Client updated successfully"
          }
        }
      },
      "delete": {
        "summary": "Delete a client's profile",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": { "type": "string" }
          }
        ],
        "responses": {
          "200": {
            "description": "Client deleted successfully"
          }
        }
      }
    },
    "/api/v1/ai/generate": {
      "post": {
        "summary": "Generate OT Activity Plan using AI",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "client_id": { "type": "string" },
                  "therapist_notes": { "type": "string" },
                  "age_range": { "type": "string" },
                  "available_equipment": { "type": "string" },
                  "session_length_minutes": { "type": "integer" }
                },
                "required": ["client_id", "therapist_notes"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "AI activity plan draft"
          }
        }
      }
    },
    "/api/v1/plans": {
      "post": {
        "summary": "Save a custom/AI activity plan for a client",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "client_id": { "type": "string" },
                  "title": { "type": "string" },
                  "summary": { "type": "string" },
                  "status": { "type": "string", "enum": ["draft", "active", "archived"] },
                  "activities": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "title": { "type": "string" },
                        "instructions": { "type": "string" },
                        "frequency": { "type": "string" },
                        "duration_minutes": { "type": "integer" },
                        "sort_order": { "type": "integer" }
                      },
                      "required": ["title", "instructions", "frequency", "duration_minutes"]
                    }
                  }
                },
                "required": ["client_id", "title"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Plan saved successfully"
          }
        }
      }
    },
    "/api/v1/plans/client/{id}": {
      "get": {
        "summary": "Get activity plans for a client",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": { "type": "string" }
          }
        ],
        "responses": {
          "200": {
            "description": "Active activity plan for the client"
          }
        }
      }
    },
    "/api/v1/plans/me": {
      "get": {
        "summary": "Get activity plans for the logged-in client",
        "responses": {
          "200": {
            "description": "Logged-in client's active plan"
          }
        }
      }
    },
    "/api/v1/progress/client/{id}": {
      "get": {
        "summary": "Get activity progress and logs for a client",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": { "type": "string" }
          }
        ],
        "responses": {
          "200": {
            "description": "Logs and target progress details"
          }
        }
      }
    },
    "/api/v1/progress/activities/{id}/completions": {
      "post": {
        "summary": "Log a completed activity session",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": { "type": "string" }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "effort": { "type": "string", "enum": ["easy", "medium", "hard"] },
                  "note": { "type": "string" }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Activity completion logged successfully"
          }
        }
      }
    },
    "/api/v1/messages/client/{id}": {
      "get": {
        "summary": "Get chat history with client",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": { "type": "string" }
          }
        ],
        "responses": {
          "200": {
            "description": "List of messages"
          }
        }
      },
      "post": {
        "summary": "Send a chat message",
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": { "type": "string" }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "body": { "type": "string" }
                },
                "required": ["body"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Message sent successfully"
          }
        }
      }
    }
  }
};
