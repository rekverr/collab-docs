
window.onload = function() {
  // Build a system
  let url = window.location.search.match(/url=([^&]+)/);
  if (url && url.length > 1) {
    url = decodeURIComponent(url[1]);
  } else {
    url = window.location.origin;
  }
  let options = {
  "swaggerDoc": {
    "openapi": "3.0.0",
    "paths": {
      "/metrics": {
        "get": {
          "operationId": "MetricsController_getMetrics",
          "parameters": [],
          "responses": {
            "200": {
              "description": "Prometheus text exposition"
            }
          },
          "summary": "Get Prometheus metrics",
          "tags": [
            "operations"
          ]
        }
      },
      "/workspaces/{workspaceId}/search": {
        "get": {
          "operationId": "SearchController_search",
          "parameters": [
            {
              "name": "workspaceId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            },
            {
              "name": "query",
              "required": true,
              "in": "query",
              "schema": {
                "minLength": 1,
                "maxLength": 200,
                "type": "string"
              }
            },
            {
              "name": "page",
              "required": true,
              "in": "query",
              "schema": {
                "minimum": 1,
                "maximum": 10000,
                "default": 1,
                "allOf": [
                  {
                    "$ref": "#/components/schemas/Object"
                  }
                ]
              }
            },
            {
              "name": "limit",
              "required": true,
              "in": "query",
              "schema": {
                "minimum": 1,
                "maximum": 50,
                "default": 20,
                "allOf": [
                  {
                    "$ref": "#/components/schemas/Object"
                  }
                ]
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/SearchDocumentsResponseDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "404": {
              "description": "Workspace membership not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Search accessible active documents in a workspace",
          "tags": [
            "search"
          ]
        }
      },
      "/auth/register": {
        "post": {
          "operationId": "AuthController_register",
          "parameters": [],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/RegisterDto"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "User registered; refresh session set as an HttpOnly cookie",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/AuthResponseDto"
                  }
                }
              }
            },
            "409": {
              "description": "Email already registered"
            }
          },
          "summary": "Register a user",
          "tags": [
            "authentication"
          ]
        }
      },
      "/auth/login": {
        "post": {
          "operationId": "AuthController_login",
          "parameters": [],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/LoginDto"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "Authenticated; refresh session set as an HttpOnly cookie",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/AuthResponseDto"
                  }
                }
              }
            },
            "401": {
              "description": "Invalid credentials"
            },
            "429": {
              "description": "Login rate limit exceeded"
            }
          },
          "summary": "Log in",
          "tags": [
            "authentication"
          ]
        }
      },
      "/auth/refresh": {
        "post": {
          "operationId": "AuthController_refresh",
          "parameters": [],
          "responses": {
            "200": {
              "description": "Refresh session rotated",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/AuthResponseDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing, expired, revoked, or reused refresh session"
            }
          },
          "security": [
            {
              "collab_docs_refresh": []
            }
          ],
          "summary": "Rotate the refresh session",
          "tags": [
            "authentication"
          ]
        }
      },
      "/auth/logout": {
        "post": {
          "operationId": "AuthController_logout",
          "parameters": [],
          "responses": {
            "204": {
              "description": ""
            }
          },
          "security": [
            {
              "collab_docs_refresh": []
            }
          ],
          "summary": "Revoke the current refresh session",
          "tags": [
            "authentication"
          ]
        }
      },
      "/auth/me": {
        "get": {
          "operationId": "AuthController_currentUser",
          "parameters": [],
          "responses": {
            "200": {
              "description": "Current authenticated user",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/AuthenticatedUserDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Get the current user",
          "tags": [
            "authentication"
          ]
        }
      },
      "/workspaces/{workspaceId}/billing/subscription": {
        "get": {
          "operationId": "BillingController_current",
          "parameters": [
            {
              "name": "workspaceId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/SubscriptionDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "billing.manage capability required for plan changes"
            },
            "404": {
              "description": "Workspace subscription not found"
            },
            "422": {
              "description": "Target plan cannot contain current usage"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Get the current workspace plan, usage, and limits",
          "tags": [
            "billing"
          ]
        }
      },
      "/workspaces/{workspaceId}/billing/checkout": {
        "post": {
          "operationId": "BillingController_checkout",
          "parameters": [
            {
              "name": "workspaceId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ChangePlanDto"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/ChangePlanResultDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "billing.manage capability required for plan changes"
            },
            "404": {
              "description": "Workspace subscription not found"
            },
            "422": {
              "description": "Target plan cannot contain current usage"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Run a mock checkout and apply a plan change",
          "tags": [
            "billing"
          ]
        }
      },
      "/workspaces/{workspaceId}/billing/mock-webhook": {
        "post": {
          "operationId": "BillingController_webhook",
          "parameters": [
            {
              "name": "workspaceId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/MockBillingWebhookDto"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/MockWebhookResultDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "billing.manage capability required for plan changes"
            },
            "404": {
              "description": "Workspace subscription not found"
            },
            "422": {
              "description": "Target plan cannot contain current usage"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Simulate idempotent Stripe-like subscription webhook delivery",
          "tags": [
            "billing"
          ]
        }
      },
      "/health": {
        "get": {
          "operationId": "HealthController_check",
          "parameters": [],
          "responses": {
            "200": {
              "description": "PostgreSQL and Redis are reachable"
            }
          },
          "summary": "Check API dependencies",
          "tags": [
            "operations"
          ]
        }
      },
      "/internal/collaboration/documents/{documentId}/access": {
        "get": {
          "operationId": "CollaborationAccessController_resolve",
          "parameters": [
            {
              "name": "documentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            },
            {
              "name": "x-document-share-token",
              "required": true,
              "in": "header",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "Authenticated identity and current document write capability"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Resolve authoritative collaboration access",
          "tags": [
            "internal-collaboration"
          ]
        }
      },
      "/workspaces": {
        "post": {
          "operationId": "WorkspacesController_create",
          "parameters": [],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/CreateWorkspaceDto"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "Workspace created",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/WorkspaceDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "The current role lacks the required capability"
            },
            "404": {
              "description": "Workspace, membership, or invitation not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Create a workspace owned by the current user",
          "tags": [
            "workspaces"
          ]
        },
        "get": {
          "operationId": "WorkspacesController_list",
          "parameters": [],
          "responses": {
            "200": {
              "description": "Workspace memberships",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "array",
                    "items": {
                      "$ref": "#/components/schemas/WorkspaceDto"
                    }
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "The current role lacks the required capability"
            },
            "404": {
              "description": "Workspace, membership, or invitation not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "List workspaces visible to the current user",
          "tags": [
            "workspaces"
          ]
        }
      },
      "/workspaces/{workspaceId}": {
        "get": {
          "operationId": "WorkspacesController_get",
          "parameters": [
            {
              "name": "workspaceId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/WorkspaceDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "The current role lacks the required capability"
            },
            "404": {
              "description": "Workspace, membership, or invitation not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Get a workspace",
          "tags": [
            "workspaces"
          ]
        },
        "patch": {
          "operationId": "WorkspacesController_update",
          "parameters": [
            {
              "name": "workspaceId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/UpdateWorkspaceDto"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/WorkspaceDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "The current role lacks the required capability"
            },
            "404": {
              "description": "Workspace, membership, or invitation not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Update workspace settings",
          "tags": [
            "workspaces"
          ]
        }
      },
      "/workspaces/{workspaceId}/members": {
        "get": {
          "operationId": "WorkspacesController_listMembers",
          "parameters": [
            {
              "name": "workspaceId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "array",
                    "items": {
                      "$ref": "#/components/schemas/WorkspaceMemberDto"
                    }
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "The current role lacks the required capability"
            },
            "404": {
              "description": "Workspace, membership, or invitation not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "List workspace members",
          "tags": [
            "workspaces"
          ]
        }
      },
      "/workspaces/{workspaceId}/invitations": {
        "post": {
          "operationId": "WorkspacesController_invite",
          "parameters": [
            {
              "name": "workspaceId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/InviteWorkspaceMemberDto"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/WorkspaceInvitationDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "The current role lacks the required capability"
            },
            "404": {
              "description": "Workspace, membership, or invitation not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Invite a user by email",
          "tags": [
            "workspaces"
          ]
        },
        "get": {
          "operationId": "WorkspacesController_listWorkspaceInvitations",
          "parameters": [
            {
              "name": "workspaceId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "array",
                    "items": {
                      "$ref": "#/components/schemas/PendingWorkspaceInvitationDto"
                    }
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "The current role lacks the required capability"
            },
            "404": {
              "description": "Workspace, membership, or invitation not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "List pending invitations for workspace administrators",
          "tags": [
            "workspaces"
          ]
        }
      },
      "/workspace-invitations/accept": {
        "post": {
          "operationId": "WorkspacesController_accept",
          "parameters": [],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/AcceptWorkspaceInvitationDto"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/AcceptedWorkspaceMembershipDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "The current role lacks the required capability"
            },
            "404": {
              "description": "Workspace, membership, or invitation not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Accept an invitation for the current account",
          "tags": [
            "workspaces"
          ]
        }
      },
      "/workspace-invitations/pending": {
        "get": {
          "operationId": "WorkspacesController_listMyInvitations",
          "parameters": [],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "array",
                    "items": {
                      "$ref": "#/components/schemas/CurrentUserWorkspaceInvitationDto"
                    }
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "The current role lacks the required capability"
            },
            "404": {
              "description": "Workspace, membership, or invitation not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "List pending workspace invitations for the current email",
          "tags": [
            "workspaces"
          ]
        }
      },
      "/workspace-invitations/{invitationId}/accept": {
        "post": {
          "operationId": "WorkspacesController_acceptById",
          "parameters": [
            {
              "name": "invitationId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "201": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/AcceptedWorkspaceMembershipDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "The current role lacks the required capability"
            },
            "404": {
              "description": "Workspace, membership, or invitation not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Accept a pending invitation belonging to the current email",
          "tags": [
            "workspaces"
          ]
        }
      },
      "/workspace-invitations/{invitationId}/decline": {
        "post": {
          "operationId": "WorkspacesController_decline",
          "parameters": [
            {
              "name": "invitationId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "204": {
              "description": "Invitation declined"
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "The current role lacks the required capability"
            },
            "404": {
              "description": "Workspace, membership, or invitation not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Decline a pending invitation belonging to the current email",
          "tags": [
            "workspaces"
          ]
        }
      },
      "/workspaces/{workspaceId}/members/{userId}": {
        "patch": {
          "operationId": "WorkspacesController_updateMemberRole",
          "parameters": [
            {
              "name": "workspaceId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            },
            {
              "name": "userId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/UpdateWorkspaceMemberRoleDto"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/UpdatedWorkspaceMembershipDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "The current role lacks the required capability"
            },
            "404": {
              "description": "Workspace, membership, or invitation not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Change a workspace member role",
          "tags": [
            "workspaces"
          ]
        },
        "delete": {
          "operationId": "WorkspacesController_removeMember",
          "parameters": [
            {
              "name": "workspaceId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            },
            {
              "name": "userId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "204": {
              "description": "Member removed"
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "The current role lacks the required capability"
            },
            "404": {
              "description": "Workspace, membership, or invitation not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Remove a workspace member",
          "tags": [
            "workspaces"
          ]
        }
      },
      "/workspaces/{workspaceId}/documents": {
        "post": {
          "operationId": "DocumentsController_create",
          "parameters": [
            {
              "name": "workspaceId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/CreateDocumentDto"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/DocumentMetadataDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Document capability required"
            },
            "404": {
              "description": "Active document or workspace not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Create a root or nested document",
          "tags": [
            "documents"
          ]
        }
      },
      "/documents/{documentId}": {
        "get": {
          "operationId": "DocumentsController_get",
          "parameters": [
            {
              "name": "documentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/DocumentMetadataDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Document capability required"
            },
            "404": {
              "description": "Active document or workspace not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Get active document metadata",
          "tags": [
            "documents"
          ]
        },
        "patch": {
          "operationId": "DocumentsController_update",
          "parameters": [
            {
              "name": "documentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/UpdateDocumentMetadataDto"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/DocumentMetadataDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Document capability required"
            },
            "404": {
              "description": "Active document or workspace not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Rename or update document metadata",
          "tags": [
            "documents"
          ]
        },
        "delete": {
          "operationId": "DocumentsController_delete",
          "parameters": [
            {
              "name": "documentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/DocumentMetadataDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Document capability required"
            },
            "404": {
              "description": "Active document or workspace not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Soft-delete a document",
          "tags": [
            "documents"
          ]
        }
      },
      "/workspaces/{workspaceId}/documents/tree": {
        "get": {
          "operationId": "DocumentsController_tree",
          "parameters": [
            {
              "name": "workspaceId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "array",
                    "items": {
                      "$ref": "#/components/schemas/DocumentTreeNodeDto"
                    }
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Document capability required"
            },
            "404": {
              "description": "Active document or workspace not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Get the ordered active document tree",
          "tags": [
            "documents"
          ]
        }
      },
      "/documents/{documentId}/move": {
        "post": {
          "operationId": "DocumentsController_move",
          "parameters": [
            {
              "name": "documentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/MoveDocumentDto"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/DocumentMetadataDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Document capability required"
            },
            "404": {
              "description": "Active document or workspace not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Move a document to a parent and deterministic sibling position",
          "tags": [
            "documents"
          ]
        }
      },
      "/workspaces/{workspaceId}/documents/reorder": {
        "post": {
          "operationId": "DocumentsController_reorder",
          "parameters": [
            {
              "name": "workspaceId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ReorderDocumentsDto"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "array",
                    "items": {
                      "$ref": "#/components/schemas/DocumentMetadataDto"
                    }
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Document capability required"
            },
            "404": {
              "description": "Active document or workspace not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Set the exact order of one active sibling set",
          "tags": [
            "documents"
          ]
        }
      },
      "/documents/{documentId}/archive": {
        "post": {
          "operationId": "DocumentsController_archive",
          "parameters": [
            {
              "name": "documentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/DocumentMetadataDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Document capability required"
            },
            "404": {
              "description": "Active document or workspace not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Archive a document",
          "tags": [
            "documents"
          ]
        }
      },
      "/documents/{documentId}/restore": {
        "post": {
          "operationId": "DocumentsController_restore",
          "parameters": [
            {
              "name": "documentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/DocumentMetadataDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Document capability required"
            },
            "404": {
              "description": "Active document or workspace not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Restore an archived or soft-deleted document",
          "tags": [
            "documents"
          ]
        }
      },
      "/documents/{documentId}/versions": {
        "post": {
          "operationId": "VersionsController_create",
          "parameters": [
            {
              "name": "documentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/CreateDocumentVersionDto"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/DocumentVersionDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Document write capability required for create or restore"
            },
            "404": {
              "description": "Document or version not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Create a user-visible version from the current durable Yjs state",
          "tags": [
            "document-versions"
          ]
        },
        "get": {
          "operationId": "VersionsController_list",
          "parameters": [
            {
              "name": "documentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "array",
                    "items": {
                      "$ref": "#/components/schemas/DocumentVersionDto"
                    }
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Document write capability required for create or restore"
            },
            "404": {
              "description": "Document or version not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "List user-visible document versions",
          "tags": [
            "document-versions"
          ]
        }
      },
      "/documents/{documentId}/versions/{versionId}": {
        "get": {
          "operationId": "VersionsController_preview",
          "parameters": [
            {
              "name": "documentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            },
            {
              "name": "versionId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/DocumentVersionPreviewDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Document write capability required for create or restore"
            },
            "404": {
              "description": "Document or version not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Preview a normalized projection of a document version",
          "tags": [
            "document-versions"
          ]
        }
      },
      "/documents/{documentId}/versions/{versionId}/restore": {
        "post": {
          "operationId": "VersionsController_restore",
          "parameters": [
            {
              "name": "documentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            },
            {
              "name": "versionId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/RestoreDocumentVersionResultDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Document write capability required for create or restore"
            },
            "404": {
              "description": "Document or version not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Restore a version as a new current CRDT state and history entry",
          "tags": [
            "document-versions"
          ]
        }
      },
      "/documents/{documentId}/comments": {
        "post": {
          "operationId": "CommentsController_create",
          "parameters": [
            {
              "name": "documentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/CreateCommentDto"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/CommentDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Comment action is not permitted"
            },
            "404": {
              "description": "Document, comment, or thread not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Create a document or block comment",
          "tags": [
            "comments"
          ]
        },
        "get": {
          "operationId": "CommentsController_list",
          "parameters": [
            {
              "name": "documentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "array",
                    "items": {
                      "$ref": "#/components/schemas/CommentThreadDto"
                    }
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Comment action is not permitted"
            },
            "404": {
              "description": "Document, comment, or thread not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "List document comment threads",
          "tags": [
            "comments"
          ]
        }
      },
      "/documents/{documentId}/comment-mention-candidates": {
        "get": {
          "operationId": "CommentsController_mentionCandidates",
          "parameters": [
            {
              "name": "documentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "array",
                    "items": {
                      "$ref": "#/components/schemas/MentionCandidateDto"
                    }
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Comment action is not permitted"
            },
            "404": {
              "description": "Document, comment, or thread not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "List active workspace members available for mentions",
          "tags": [
            "comments"
          ]
        }
      },
      "/comments/{commentId}/replies": {
        "post": {
          "operationId": "CommentsController_reply",
          "parameters": [
            {
              "name": "commentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/CreateReplyDto"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/CommentDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Comment action is not permitted"
            },
            "404": {
              "description": "Document, comment, or thread not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Reply to a comment thread",
          "tags": [
            "comments"
          ]
        }
      },
      "/comments/{commentId}": {
        "patch": {
          "operationId": "CommentsController_edit",
          "parameters": [
            {
              "name": "commentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/UpdateCommentDto"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/CommentDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Comment action is not permitted"
            },
            "404": {
              "description": "Document, comment, or thread not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Edit an own comment",
          "tags": [
            "comments"
          ]
        },
        "delete": {
          "operationId": "CommentsController_delete",
          "parameters": [
            {
              "name": "commentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "204": {
              "description": ""
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Comment action is not permitted"
            },
            "404": {
              "description": "Document, comment, or thread not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Delete or redact an own comment",
          "tags": [
            "comments"
          ]
        }
      },
      "/comments/{commentId}/resolution": {
        "patch": {
          "operationId": "CommentsController_resolve",
          "parameters": [
            {
              "name": "commentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ResolveCommentDto"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/CommentDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Comment action is not permitted"
            },
            "404": {
              "description": "Document, comment, or thread not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Resolve or reopen a root comment thread",
          "tags": [
            "comments"
          ]
        }
      },
      "/notifications": {
        "get": {
          "operationId": "NotificationsController_list",
          "parameters": [],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "type": "array",
                    "items": {
                      "$ref": "#/components/schemas/NotificationDto"
                    }
                  }
                }
              }
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "List accessible notifications for the current user",
          "tags": [
            "notifications"
          ]
        }
      },
      "/notifications/{notificationId}/read": {
        "patch": {
          "operationId": "NotificationsController_markRead",
          "parameters": [
            {
              "name": "notificationId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/NotificationDto"
                  }
                }
              }
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Mark an accessible notification as read",
          "tags": [
            "notifications"
          ]
        }
      },
      "/documents/{documentId}/attachments/upload-requests": {
        "post": {
          "operationId": "AttachmentsController_requestUpload",
          "parameters": [
            {
              "name": "documentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/RequestAttachmentUploadDto"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/AttachmentUploadDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Document or attachment capability required"
            },
            "404": {
              "description": "Document or attachment not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Reserve quota and request a direct S3 upload URL",
          "tags": [
            "attachments"
          ]
        }
      },
      "/attachments/{attachmentId}/finalize": {
        "post": {
          "operationId": "AttachmentsController_finalize",
          "parameters": [
            {
              "name": "attachmentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/AttachmentDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Document or attachment capability required"
            },
            "404": {
              "description": "Document or attachment not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Verify a direct upload and register the attachment",
          "tags": [
            "attachments"
          ]
        }
      },
      "/attachments/{attachmentId}/download": {
        "get": {
          "operationId": "AttachmentsController_download",
          "parameters": [
            {
              "name": "attachmentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/AttachmentDownloadDto"
                  }
                }
              }
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Document or attachment capability required"
            },
            "404": {
              "description": "Document or attachment not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Request a short-lived authorized attachment URL",
          "tags": [
            "attachments"
          ]
        }
      },
      "/attachments/{attachmentId}": {
        "delete": {
          "operationId": "AttachmentsController_delete",
          "parameters": [
            {
              "name": "attachmentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "204": {
              "description": ""
            },
            "401": {
              "description": "Missing or invalid access token"
            },
            "403": {
              "description": "Document or attachment capability required"
            },
            "404": {
              "description": "Document or attachment not found"
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Delete an attachment and release workspace storage",
          "tags": [
            "attachments"
          ]
        }
      },
      "/documents/{documentId}/sharing": {
        "get": {
          "operationId": "DocumentSharingController_state",
          "parameters": [
            {
              "name": "documentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/DocumentSharingStateDto"
                  }
                }
              }
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Get publication and share-link state",
          "tags": [
            "document-sharing"
          ]
        }
      },
      "/documents/{documentId}/publication": {
        "post": {
          "operationId": "DocumentSharingController_setPublication",
          "parameters": [
            {
              "name": "documentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/SetPublicationDto"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/DocumentSharingStateDto"
                  }
                }
              }
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Publish or unpublish a document",
          "tags": [
            "document-sharing"
          ]
        }
      },
      "/documents/{documentId}/share-links": {
        "post": {
          "operationId": "DocumentSharingController_createLink",
          "parameters": [
            {
              "name": "documentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/CreateShareLinkDto"
                }
              }
            }
          },
          "responses": {
            "201": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/ShareLinkDto"
                  }
                }
              }
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Create a view-only or editable document share link",
          "tags": [
            "document-sharing"
          ]
        }
      },
      "/document-share-links/{linkId}": {
        "delete": {
          "operationId": "DocumentSharingController_revoke",
          "parameters": [
            {
              "name": "linkId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/ShareLinkDto"
                  }
                }
              }
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Revoke a document share link",
          "tags": [
            "document-sharing"
          ]
        }
      },
      "/document-share-links/{linkId}/regenerate": {
        "post": {
          "operationId": "DocumentSharingController_regenerate",
          "parameters": [
            {
              "name": "linkId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "201": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/ShareLinkDto"
                  }
                }
              }
            }
          },
          "security": [
            {
              "bearer": []
            }
          ],
          "summary": "Revoke a share token and issue a replacement",
          "tags": [
            "document-sharing"
          ]
        }
      },
      "/shares/resolve": {
        "post": {
          "operationId": "DocumentSharingController_resolveShare",
          "parameters": [],
          "requestBody": {
            "required": true,
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ResolveShareLinkDto"
                }
              }
            }
          },
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/SharedDocumentDto"
                  }
                }
              }
            }
          },
          "summary": "Resolve an active document share token without workspace data",
          "tags": [
            "document-sharing"
          ]
        }
      },
      "/public-documents/{publicSlug}": {
        "get": {
          "operationId": "DocumentSharingController_resolvePublished",
          "parameters": [
            {
              "name": "publicSlug",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": "",
              "content": {
                "application/json": {
                  "schema": {
                    "$ref": "#/components/schemas/PublishedDocumentDto"
                  }
                }
              }
            }
          },
          "summary": "Resolve a currently published document projection",
          "tags": [
            "document-sharing"
          ]
        }
      },
      "/public-documents/{publicSlug}/attachments/{attachmentId}": {
        "get": {
          "operationId": "DocumentSharingController_publicAttachment",
          "parameters": [
            {
              "name": "publicSlug",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            },
            {
              "name": "attachmentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": ""
            }
          },
          "summary": "Redirect a published attachment to short-lived object storage",
          "tags": [
            "document-sharing"
          ]
        }
      },
      "/shares/{token}/attachments/{attachmentId}": {
        "get": {
          "operationId": "DocumentSharingController_sharedAttachment",
          "parameters": [
            {
              "name": "token",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            },
            {
              "name": "attachmentId",
              "required": true,
              "in": "path",
              "schema": {
                "type": "string"
              }
            }
          ],
          "responses": {
            "200": {
              "description": ""
            }
          },
          "summary": "Redirect an active shared attachment to short-lived object storage",
          "tags": [
            "document-sharing"
          ]
        }
      }
    },
    "info": {
      "title": "Collab Docs API",
      "description": "REST API for Collab Docs",
      "version": "0.1.0",
      "contact": {}
    },
    "tags": [],
    "servers": [],
    "components": {
      "securitySchemes": {
        "bearer": {
          "scheme": "bearer",
          "bearerFormat": "JWT",
          "type": "http"
        },
        "cookie": {
          "type": "apiKey",
          "in": "cookie",
          "name": "collab_docs_refresh"
        }
      },
      "schemas": {
        "Object": {
          "type": "object",
          "properties": {}
        },
        "SearchDocumentResultDto": {
          "type": "object",
          "properties": {
            "documentId": {
              "type": "string"
            },
            "workspaceId": {
              "type": "string"
            },
            "parentId": {
              "type": "object",
              "nullable": true
            },
            "title": {
              "type": "string"
            },
            "snippet": {
              "type": "object",
              "nullable": true
            },
            "rank": {
              "type": "number"
            },
            "updatedAt": {
              "format": "date-time",
              "type": "string"
            }
          },
          "required": [
            "documentId",
            "workspaceId",
            "parentId",
            "title",
            "snippet",
            "rank",
            "updatedAt"
          ]
        },
        "SearchDocumentsResponseDto": {
          "type": "object",
          "properties": {
            "items": {
              "type": "array",
              "items": {
                "$ref": "#/components/schemas/SearchDocumentResultDto"
              }
            },
            "page": {
              "type": "number"
            },
            "limit": {
              "type": "number"
            },
            "hasMore": {
              "type": "boolean"
            }
          },
          "required": [
            "items",
            "page",
            "limit",
            "hasMore"
          ]
        },
        "RegisterDto": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string",
              "example": "person@example.com"
            },
            "password": {
              "type": "string",
              "minLength": 12,
              "format": "password"
            },
            "displayName": {
              "type": "string",
              "maxLength": 120
            }
          },
          "required": [
            "email",
            "password"
          ]
        },
        "AuthenticatedUserDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid"
            },
            "email": {
              "type": "string",
              "format": "email"
            },
            "displayName": {
              "type": "object",
              "nullable": true
            }
          },
          "required": [
            "id",
            "email"
          ]
        },
        "AuthResponseDto": {
          "type": "object",
          "properties": {
            "accessToken": {
              "type": "string",
              "description": "Short-lived JWT used as a Bearer access token"
            },
            "user": {
              "$ref": "#/components/schemas/AuthenticatedUserDto"
            }
          },
          "required": [
            "accessToken",
            "user"
          ]
        },
        "LoginDto": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string",
              "example": "person@example.com"
            },
            "password": {
              "type": "string",
              "format": "password"
            }
          },
          "required": [
            "email",
            "password"
          ]
        },
        "BillingResourceUsageDto": {
          "type": "object",
          "properties": {
            "used": {
              "type": "number"
            },
            "limit": {
              "type": "number"
            }
          },
          "required": [
            "used",
            "limit"
          ]
        },
        "BillingStorageUsageDto": {
          "type": "object",
          "properties": {
            "usedBytes": {
              "type": "string"
            },
            "limitBytes": {
              "type": "string"
            }
          },
          "required": [
            "usedBytes",
            "limitBytes"
          ]
        },
        "SubscriptionDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "workspaceId": {
              "type": "string"
            },
            "plan": {
              "type": "string",
              "enum": [
                "FREE",
                "PRO",
                "TEAM"
              ]
            },
            "status": {
              "type": "string",
              "enum": [
                "ACTIVE",
                "PAST_DUE",
                "CANCELED"
              ]
            },
            "members": {
              "$ref": "#/components/schemas/BillingResourceUsageDto"
            },
            "documents": {
              "$ref": "#/components/schemas/BillingResourceUsageDto"
            },
            "storage": {
              "$ref": "#/components/schemas/BillingStorageUsageDto"
            },
            "currentPeriodStart": {
              "type": "object",
              "nullable": true
            },
            "currentPeriodEnd": {
              "type": "object",
              "nullable": true
            },
            "updatedAt": {
              "format": "date-time",
              "type": "string"
            }
          },
          "required": [
            "id",
            "workspaceId",
            "plan",
            "status",
            "members",
            "documents",
            "storage",
            "currentPeriodStart",
            "currentPeriodEnd",
            "updatedAt"
          ]
        },
        "ChangePlanDto": {
          "type": "object",
          "properties": {
            "plan": {
              "type": "string",
              "enum": [
                "FREE",
                "PRO",
                "TEAM"
              ]
            }
          },
          "required": [
            "plan"
          ]
        },
        "ChangePlanResultDto": {
          "type": "object",
          "properties": {
            "checkoutId": {
              "type": "string"
            },
            "eventId": {
              "type": "string"
            },
            "applied": {
              "type": "boolean"
            },
            "subscription": {
              "$ref": "#/components/schemas/SubscriptionDto"
            }
          },
          "required": [
            "checkoutId",
            "eventId",
            "applied",
            "subscription"
          ]
        },
        "MockBillingWebhookDto": {
          "type": "object",
          "properties": {
            "plan": {
              "type": "string",
              "enum": [
                "FREE",
                "PRO",
                "TEAM"
              ]
            },
            "eventId": {
              "type": "string"
            },
            "eventType": {
              "type": "object",
              "default": "customer.subscription.updated"
            }
          },
          "required": [
            "plan",
            "eventId"
          ]
        },
        "MockWebhookResultDto": {
          "type": "object",
          "properties": {
            "eventId": {
              "type": "string"
            },
            "applied": {
              "type": "boolean"
            },
            "subscription": {
              "$ref": "#/components/schemas/SubscriptionDto"
            }
          },
          "required": [
            "eventId",
            "applied",
            "subscription"
          ]
        },
        "CreateWorkspaceDto": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "example": "Acme Docs"
            },
            "slug": {
              "type": "string",
              "example": "acme-docs"
            }
          },
          "required": [
            "name",
            "slug"
          ]
        },
        "WorkspaceDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid"
            },
            "name": {
              "type": "string"
            },
            "slug": {
              "type": "string"
            },
            "ownerId": {
              "type": "string",
              "format": "uuid"
            },
            "role": {
              "type": "string",
              "enum": [
                "OWNER",
                "ADMIN",
                "EDITOR",
                "VIEWER"
              ]
            },
            "createdAt": {
              "format": "date-time",
              "type": "string"
            },
            "updatedAt": {
              "format": "date-time",
              "type": "string"
            }
          },
          "required": [
            "id",
            "name",
            "slug",
            "ownerId",
            "role",
            "createdAt",
            "updatedAt"
          ]
        },
        "UpdateWorkspaceDto": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "example": "Acme Knowledge Base"
            }
          }
        },
        "WorkspaceMemberUserDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid"
            },
            "email": {
              "type": "string",
              "format": "email"
            },
            "displayName": {
              "type": "object",
              "nullable": true
            }
          },
          "required": [
            "id",
            "email"
          ]
        },
        "WorkspaceMemberDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid"
            },
            "role": {
              "type": "string",
              "enum": [
                "OWNER",
                "ADMIN",
                "EDITOR",
                "VIEWER"
              ]
            },
            "user": {
              "$ref": "#/components/schemas/WorkspaceMemberUserDto"
            },
            "createdAt": {
              "format": "date-time",
              "type": "string"
            },
            "updatedAt": {
              "format": "date-time",
              "type": "string"
            }
          },
          "required": [
            "id",
            "role",
            "user",
            "createdAt",
            "updatedAt"
          ]
        },
        "InviteWorkspaceMemberDto": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string",
              "example": "teammate@example.com"
            },
            "role": {
              "type": "string",
              "enum": [
                "OWNER",
                "ADMIN",
                "EDITOR",
                "VIEWER"
              ],
              "example": "EDITOR"
            }
          },
          "required": [
            "email",
            "role"
          ]
        },
        "WorkspaceInvitationDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid"
            },
            "workspaceId": {
              "type": "string",
              "format": "uuid"
            },
            "email": {
              "type": "string",
              "format": "email"
            },
            "role": {
              "type": "string",
              "enum": [
                "OWNER",
                "ADMIN",
                "EDITOR",
                "VIEWER"
              ]
            },
            "status": {
              "type": "string"
            },
            "expiresAt": {
              "format": "date-time",
              "type": "string"
            },
            "createdAt": {
              "format": "date-time",
              "type": "string"
            },
            "token": {
              "type": "string",
              "description": "Returned only once so it can be delivered to the invitee"
            }
          },
          "required": [
            "id",
            "workspaceId",
            "email",
            "role",
            "status",
            "expiresAt",
            "createdAt",
            "token"
          ]
        },
        "AcceptWorkspaceInvitationDto": {
          "type": "object",
          "properties": {
            "token": {
              "type": "string",
              "description": "Raw invitation token delivered to the invitee"
            }
          },
          "required": [
            "token"
          ]
        },
        "AcceptedWorkspaceMembershipDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid"
            },
            "workspaceId": {
              "type": "string",
              "format": "uuid"
            },
            "userId": {
              "type": "string",
              "format": "uuid"
            },
            "role": {
              "type": "string",
              "enum": [
                "OWNER",
                "ADMIN",
                "EDITOR",
                "VIEWER"
              ]
            },
            "createdAt": {
              "format": "date-time",
              "type": "string"
            }
          },
          "required": [
            "id",
            "workspaceId",
            "userId",
            "role",
            "createdAt"
          ]
        },
        "InvitationWorkspaceDto": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string"
            }
          },
          "required": [
            "name"
          ]
        },
        "InvitationInviterDto": {
          "type": "object",
          "properties": {
            "email": {
              "type": "string",
              "format": "email"
            },
            "displayName": {
              "type": "object",
              "nullable": true
            }
          },
          "required": [
            "email"
          ]
        },
        "CurrentUserWorkspaceInvitationDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid"
            },
            "workspaceId": {
              "type": "string",
              "format": "uuid"
            },
            "role": {
              "type": "string",
              "enum": [
                "OWNER",
                "ADMIN",
                "EDITOR",
                "VIEWER"
              ]
            },
            "status": {
              "type": "string",
              "example": "PENDING"
            },
            "expiresAt": {
              "format": "date-time",
              "type": "string"
            },
            "createdAt": {
              "format": "date-time",
              "type": "string"
            },
            "workspace": {
              "$ref": "#/components/schemas/InvitationWorkspaceDto"
            },
            "invitedBy": {
              "nullable": true,
              "type": "object",
              "allOf": [
                {
                  "$ref": "#/components/schemas/InvitationInviterDto"
                }
              ]
            }
          },
          "required": [
            "id",
            "workspaceId",
            "role",
            "status",
            "expiresAt",
            "createdAt",
            "workspace"
          ]
        },
        "PendingWorkspaceInvitationDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid"
            },
            "workspaceId": {
              "type": "string",
              "format": "uuid"
            },
            "email": {
              "type": "string",
              "format": "email"
            },
            "role": {
              "type": "string",
              "enum": [
                "OWNER",
                "ADMIN",
                "EDITOR",
                "VIEWER"
              ]
            },
            "status": {
              "type": "string",
              "example": "PENDING"
            },
            "expiresAt": {
              "format": "date-time",
              "type": "string"
            },
            "createdAt": {
              "format": "date-time",
              "type": "string"
            }
          },
          "required": [
            "id",
            "workspaceId",
            "email",
            "role",
            "status",
            "expiresAt",
            "createdAt"
          ]
        },
        "UpdateWorkspaceMemberRoleDto": {
          "type": "object",
          "properties": {
            "role": {
              "type": "string",
              "enum": [
                "OWNER",
                "ADMIN",
                "EDITOR",
                "VIEWER"
              ],
              "example": "VIEWER"
            }
          },
          "required": [
            "role"
          ]
        },
        "UpdatedWorkspaceMembershipDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string",
              "format": "uuid"
            },
            "workspaceId": {
              "type": "string",
              "format": "uuid"
            },
            "userId": {
              "type": "string",
              "format": "uuid"
            },
            "role": {
              "type": "string",
              "enum": [
                "OWNER",
                "ADMIN",
                "EDITOR",
                "VIEWER"
              ]
            },
            "updatedAt": {
              "format": "date-time",
              "type": "string"
            }
          },
          "required": [
            "id",
            "workspaceId",
            "userId",
            "role",
            "updatedAt"
          ]
        },
        "CreateDocumentDto": {
          "type": "object",
          "properties": {
            "title": {
              "type": "string",
              "default": "Untitled"
            },
            "parentId": {
              "type": "string",
              "nullable": true
            }
          }
        },
        "DocumentMetadataDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "workspaceId": {
              "type": "string"
            },
            "parentId": {
              "type": "object",
              "nullable": true
            },
            "title": {
              "type": "string"
            },
            "sortKey": {
              "type": "string"
            },
            "publicationState": {
              "type": "string"
            },
            "archivedAt": {
              "type": "object",
              "nullable": true
            },
            "deletedAt": {
              "type": "object",
              "nullable": true
            },
            "createdAt": {
              "format": "date-time",
              "type": "string"
            },
            "updatedAt": {
              "format": "date-time",
              "type": "string"
            }
          },
          "required": [
            "id",
            "workspaceId",
            "title",
            "sortKey",
            "publicationState",
            "createdAt",
            "updatedAt"
          ]
        },
        "DocumentTreeNodeDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "workspaceId": {
              "type": "string"
            },
            "parentId": {
              "type": "object",
              "nullable": true
            },
            "title": {
              "type": "string"
            },
            "sortKey": {
              "type": "string"
            },
            "publicationState": {
              "type": "string"
            },
            "archivedAt": {
              "type": "object",
              "nullable": true
            },
            "deletedAt": {
              "type": "object",
              "nullable": true
            },
            "createdAt": {
              "format": "date-time",
              "type": "string"
            },
            "updatedAt": {
              "format": "date-time",
              "type": "string"
            },
            "children": {
              "type": "array",
              "items": {
                "$ref": "#/components/schemas/DocumentTreeNodeDto"
              }
            }
          },
          "required": [
            "id",
            "workspaceId",
            "title",
            "sortKey",
            "publicationState",
            "createdAt",
            "updatedAt",
            "children"
          ]
        },
        "UpdateDocumentMetadataDto": {
          "type": "object",
          "properties": {
            "title": {
              "type": "string",
              "example": "Project brief"
            }
          },
          "required": [
            "title"
          ]
        },
        "MoveDocumentDto": {
          "type": "object",
          "properties": {
            "parentId": {
              "type": "string",
              "nullable": true,
              "description": "Null moves the document to the workspace root"
            },
            "beforeDocumentId": {
              "type": "string",
              "description": "Place immediately before this destination sibling"
            }
          }
        },
        "ReorderDocumentsDto": {
          "type": "object",
          "properties": {
            "parentId": {
              "type": "string",
              "nullable": true
            },
            "orderedDocumentIds": {
              "description": "All active sibling IDs in their desired order",
              "type": "array",
              "items": {
                "type": "string"
              }
            }
          },
          "required": [
            "orderedDocumentIds"
          ]
        },
        "CreateDocumentVersionDto": {
          "type": "object",
          "properties": {
            "title": {
              "type": "string",
              "description": "Optional label; defaults to the current document title"
            }
          }
        },
        "DocumentVersionAuthorDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "email": {
              "type": "string"
            },
            "displayName": {
              "type": "object",
              "nullable": true
            }
          },
          "required": [
            "id",
            "email"
          ]
        },
        "DocumentVersionDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "documentId": {
              "type": "string"
            },
            "title": {
              "type": "string"
            },
            "sourceSequence": {
              "type": "string",
              "description": "Durable CRDT sequence represented by this version"
            },
            "restoredFromVersionId": {
              "type": "object",
              "nullable": true
            },
            "author": {
              "nullable": true,
              "type": "object",
              "allOf": [
                {
                  "$ref": "#/components/schemas/DocumentVersionAuthorDto"
                }
              ]
            },
            "createdAt": {
              "format": "date-time",
              "type": "string"
            }
          },
          "required": [
            "id",
            "documentId",
            "title",
            "sourceSequence",
            "createdAt"
          ]
        },
        "DocumentVersionPreviewDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "documentId": {
              "type": "string"
            },
            "title": {
              "type": "string"
            },
            "sourceSequence": {
              "type": "string",
              "description": "Durable CRDT sequence represented by this version"
            },
            "restoredFromVersionId": {
              "type": "object",
              "nullable": true
            },
            "author": {
              "nullable": true,
              "type": "object",
              "allOf": [
                {
                  "$ref": "#/components/schemas/DocumentVersionAuthorDto"
                }
              ]
            },
            "createdAt": {
              "format": "date-time",
              "type": "string"
            },
            "contentProjection": {
              "type": "object",
              "additionalProperties": true
            }
          },
          "required": [
            "id",
            "documentId",
            "title",
            "sourceSequence",
            "createdAt",
            "contentProjection"
          ]
        },
        "RestoreDocumentVersionResultDto": {
          "type": "object",
          "properties": {
            "version": {
              "$ref": "#/components/schemas/DocumentVersionDto"
            },
            "collaborationReloadRequested": {
              "type": "boolean",
              "description": "Whether active collaboration rooms were asked to reconnect"
            }
          },
          "required": [
            "version",
            "collaborationReloadRequested"
          ]
        },
        "CreateCommentDto": {
          "type": "object",
          "properties": {
            "body": {
              "type": "string",
              "maxLength": 4000
            },
            "blockId": {
              "type": "string",
              "description": "Stable editor block ID; omit for a document comment"
            }
          },
          "required": [
            "body"
          ]
        },
        "CommentAuthorDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "email": {
              "type": "string"
            },
            "displayName": {
              "type": "object",
              "nullable": true
            }
          },
          "required": [
            "id",
            "email"
          ]
        },
        "CommentDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "documentId": {
              "type": "string"
            },
            "parentId": {
              "type": "object",
              "nullable": true
            },
            "blockId": {
              "type": "object",
              "nullable": true
            },
            "body": {
              "type": "string"
            },
            "deleted": {
              "type": "boolean"
            },
            "resolvedAt": {
              "type": "object",
              "nullable": true
            },
            "resolvedBy": {
              "nullable": true,
              "type": "object",
              "allOf": [
                {
                  "$ref": "#/components/schemas/CommentAuthorDto"
                }
              ]
            },
            "author": {
              "$ref": "#/components/schemas/CommentAuthorDto"
            },
            "createdAt": {
              "format": "date-time",
              "type": "string"
            },
            "updatedAt": {
              "format": "date-time",
              "type": "string"
            }
          },
          "required": [
            "id",
            "documentId",
            "body",
            "deleted",
            "author",
            "createdAt",
            "updatedAt"
          ]
        },
        "CommentThreadDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "documentId": {
              "type": "string"
            },
            "parentId": {
              "type": "object",
              "nullable": true
            },
            "blockId": {
              "type": "object",
              "nullable": true
            },
            "body": {
              "type": "string"
            },
            "deleted": {
              "type": "boolean"
            },
            "resolvedAt": {
              "type": "object",
              "nullable": true
            },
            "resolvedBy": {
              "nullable": true,
              "type": "object",
              "allOf": [
                {
                  "$ref": "#/components/schemas/CommentAuthorDto"
                }
              ]
            },
            "author": {
              "$ref": "#/components/schemas/CommentAuthorDto"
            },
            "createdAt": {
              "format": "date-time",
              "type": "string"
            },
            "updatedAt": {
              "format": "date-time",
              "type": "string"
            },
            "replies": {
              "type": "array",
              "items": {
                "$ref": "#/components/schemas/CommentDto"
              }
            }
          },
          "required": [
            "id",
            "documentId",
            "body",
            "deleted",
            "author",
            "createdAt",
            "updatedAt",
            "replies"
          ]
        },
        "MentionCandidateDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "email": {
              "type": "string"
            },
            "displayName": {
              "type": "object",
              "nullable": true
            }
          },
          "required": [
            "id",
            "email"
          ]
        },
        "CreateReplyDto": {
          "type": "object",
          "properties": {
            "body": {
              "type": "string",
              "maxLength": 4000
            }
          },
          "required": [
            "body"
          ]
        },
        "UpdateCommentDto": {
          "type": "object",
          "properties": {
            "body": {
              "type": "string",
              "maxLength": 4000
            }
          },
          "required": [
            "body"
          ]
        },
        "ResolveCommentDto": {
          "type": "object",
          "properties": {
            "resolved": {
              "type": "boolean"
            }
          },
          "required": [
            "resolved"
          ]
        },
        "NotificationActorDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "email": {
              "type": "string"
            },
            "displayName": {
              "type": "object",
              "nullable": true
            }
          },
          "required": [
            "id",
            "email"
          ]
        },
        "NotificationDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "type": {
              "type": "string"
            },
            "workspaceId": {
              "type": "object",
              "nullable": true
            },
            "workspaceName": {
              "type": "object",
              "nullable": true
            },
            "documentId": {
              "type": "object",
              "nullable": true
            },
            "documentTitle": {
              "type": "object",
              "nullable": true
            },
            "commentId": {
              "type": "object",
              "nullable": true
            },
            "actor": {
              "nullable": true,
              "type": "object",
              "allOf": [
                {
                  "$ref": "#/components/schemas/NotificationActorDto"
                }
              ]
            },
            "readAt": {
              "type": "object",
              "nullable": true
            },
            "createdAt": {
              "format": "date-time",
              "type": "string"
            }
          },
          "required": [
            "id",
            "type",
            "createdAt"
          ]
        },
        "RequestAttachmentUploadDto": {
          "type": "object",
          "properties": {
            "fileName": {
              "type": "string",
              "maxLength": 255
            },
            "mimeType": {
              "type": "string",
              "example": "image/png"
            },
            "sizeBytes": {
              "type": "number",
              "maximum": 10485760
            }
          },
          "required": [
            "fileName",
            "mimeType",
            "sizeBytes"
          ]
        },
        "AttachmentDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "documentId": {
              "type": "string"
            },
            "fileName": {
              "type": "string"
            },
            "mimeType": {
              "type": "string"
            },
            "sizeBytes": {
              "type": "number"
            },
            "status": {
              "type": "string"
            },
            "createdAt": {
              "format": "date-time",
              "type": "string"
            }
          },
          "required": [
            "id",
            "documentId",
            "fileName",
            "mimeType",
            "sizeBytes",
            "status",
            "createdAt"
          ]
        },
        "AttachmentUploadDto": {
          "type": "object",
          "properties": {
            "attachment": {
              "$ref": "#/components/schemas/AttachmentDto"
            },
            "uploadUrl": {
              "type": "string"
            },
            "expiresAt": {
              "format": "date-time",
              "type": "string"
            },
            "requiredHeaders": {
              "type": "object"
            }
          },
          "required": [
            "attachment",
            "uploadUrl",
            "expiresAt",
            "requiredHeaders"
          ]
        },
        "AttachmentDownloadDto": {
          "type": "object",
          "properties": {
            "url": {
              "type": "string"
            },
            "expiresAt": {
              "format": "date-time",
              "type": "string"
            }
          },
          "required": [
            "url",
            "expiresAt"
          ]
        },
        "ShareLinkDto": {
          "type": "object",
          "properties": {
            "id": {
              "type": "string"
            },
            "accessMode": {
              "type": "string",
              "enum": [
                "VIEW",
                "EDIT"
              ]
            },
            "expiresAt": {
              "type": "object",
              "nullable": true
            },
            "revokedAt": {
              "type": "object",
              "nullable": true
            },
            "url": {
              "type": "object",
              "nullable": true,
              "description": "Available only after create/regenerate"
            },
            "createdAt": {
              "format": "date-time",
              "type": "string"
            },
            "updatedAt": {
              "format": "date-time",
              "type": "string"
            }
          },
          "required": [
            "id",
            "accessMode",
            "createdAt",
            "updatedAt"
          ]
        },
        "DocumentSharingStateDto": {
          "type": "object",
          "properties": {
            "documentId": {
              "type": "string"
            },
            "published": {
              "type": "boolean"
            },
            "publicSlug": {
              "type": "object",
              "nullable": true
            },
            "publicUrl": {
              "type": "object",
              "nullable": true
            },
            "links": {
              "type": "array",
              "items": {
                "$ref": "#/components/schemas/ShareLinkDto"
              }
            }
          },
          "required": [
            "documentId",
            "published",
            "links"
          ]
        },
        "SetPublicationDto": {
          "type": "object",
          "properties": {
            "published": {
              "type": "boolean"
            }
          },
          "required": [
            "published"
          ]
        },
        "CreateShareLinkDto": {
          "type": "object",
          "properties": {
            "accessMode": {
              "type": "string",
              "enum": [
                "VIEW",
                "EDIT"
              ]
            },
            "expiresAt": {
              "type": "object",
              "nullable": true,
              "description": "ISO-8601 timestamp in the future"
            }
          },
          "required": [
            "accessMode"
          ]
        },
        "ResolveShareLinkDto": {
          "type": "object",
          "properties": {
            "token": {
              "type": "string"
            }
          },
          "required": [
            "token"
          ]
        },
        "SharedDocumentDto": {
          "type": "object",
          "properties": {
            "documentId": {
              "type": "string"
            },
            "title": {
              "type": "string"
            },
            "accessMode": {
              "type": "string",
              "enum": [
                "VIEW",
                "EDIT"
              ]
            },
            "expiresAt": {
              "type": "object",
              "nullable": true
            },
            "contentProjection": {
              "type": "object",
              "additionalProperties": true,
              "nullable": true
            }
          },
          "required": [
            "documentId",
            "title",
            "accessMode"
          ]
        },
        "PublishedDocumentDto": {
          "type": "object",
          "properties": {
            "documentId": {
              "type": "string"
            },
            "title": {
              "type": "string"
            },
            "publicSlug": {
              "type": "string"
            },
            "contentProjection": {
              "type": "object",
              "additionalProperties": true,
              "nullable": true
            },
            "projectionUpdatedAt": {
              "type": "object",
              "nullable": true
            }
          },
          "required": [
            "documentId",
            "title",
            "publicSlug",
            "projectionUpdatedAt"
          ]
        }
      }
    }
  },
  "customOptions": {}
};
  url = options.swaggerUrl || url
  let urls = options.swaggerUrls
  let customOptions = options.customOptions
  let spec1 = options.swaggerDoc
  let swaggerOptions = {
    spec: spec1,
    url: url,
    urls: urls,
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [
      SwaggerUIBundle.presets.apis,
      SwaggerUIStandalonePreset
    ],
    plugins: [
      SwaggerUIBundle.plugins.DownloadUrl
    ],
    layout: "StandaloneLayout"
  }
  for (let attrname in customOptions) {
    swaggerOptions[attrname] = customOptions[attrname];
  }
  let ui = SwaggerUIBundle(swaggerOptions)

  if (customOptions.initOAuth) {
    ui.initOAuth(customOptions.initOAuth)
  }

  if (customOptions.authAction) {
    ui.authActions.authorize(customOptions.authAction)
  }
  
  window.ui = ui
}
