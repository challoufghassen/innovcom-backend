const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'InnovCom API',
    version: '1.0.0',
    description: 'API documentation for InnovCom web and mobile clients.'
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local host' },
    { url: 'http://192.168.100.4:3000', description: 'LAN host' }
  ],
  tags: [
    { name: 'Health' },
    { name: 'Public' },
    { name: 'Auth' },
    { name: 'Admin' }
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: {
          '200': {
            description: 'API status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    service: { type: 'string', example: 'innovcom-api' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/public/home': {
      get: {
        tags: ['Public'],
        summary: 'Get homepage payload',
        responses: {
          '200': { description: 'Homepage content with stats and recent data' }
        }
      }
    },
    '/api/public/projects': {
      get: {
        tags: ['Public'],
        summary: 'Search/list projects',
        parameters: [
          {
            in: 'query',
            name: 'q',
            schema: { type: 'string' },
            description: 'Project text search'
          }
        ],
        responses: {
          '200': { description: 'Project list' }
        }
      }
    },
    '/api/public/publications': {
      get: {
        tags: ['Public'],
        summary: 'Search/list publications',
        parameters: [
          {
            in: 'query',
            name: 'q',
            schema: { type: 'string' },
            description: 'Publication text search'
          }
        ],
        responses: {
          '200': { description: 'Publication list' }
        }
      }
    },
    '/api/public/events': {
      get: {
        tags: ['Public'],
        summary: 'List events',
        responses: {
          '200': { description: 'Event list' }
        }
      }
    },
    '/api/public/team': {
      get: {
        tags: ['Public'],
        summary: 'List team members',
        responses: {
          '200': { description: 'Team list' }
        }
      }
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login and get JWT token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', format: 'password' }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'Authenticated' },
          '401': { description: 'Invalid credentials' }
        }
      }
    },
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new account pending admin approval',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['fullName', 'email', 'password'],
                properties: {
                  fullName: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', format: 'password' },
                  speciality: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          '201': { description: 'Account created and pending approval' },
          '400': { description: 'Missing required fields' },
          '409': { description: 'Email already exists' }
        }
      }
    },
    '/api/admin/dashboard': {
      get: {
        tags: ['Admin'],
        summary: 'Get dashboard stats (requires token)',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Dashboard stats' },
          '401': { description: 'Missing/invalid token' }
        }
      }
    },
    '/api/admin/users/pending': {
      get: {
        tags: ['Admin'],
        summary: 'List users waiting for approval',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Pending users' }
        }
      }
    },
    '/api/admin/users/{id}/approve': {
      patch: {
        tags: ['Admin'],
        summary: 'Approve a user and assign a role',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            in: 'path',
            name: 'id',
            required: true,
            schema: { type: 'integer' }
          }
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['admin', 'researcher'] },
                  speciality: { type: 'string' }
                }
              }
            }
          }
        },
        responses: {
          '200': { description: 'User approved' },
          '404': { description: 'User not found' }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    }
  }
};

export default swaggerSpec;