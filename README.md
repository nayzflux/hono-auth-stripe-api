# Hono API Template

## Tech Stack

**Web Framework** - Hono
**Validation** - Zod
**ORM** - Drizzle ORM
**Database** - MySQL2
**Auth** - Lucia

## Enpoints

### Auth

### Sign Up

POST http://localhost:5000/api/v1/auth/sign-up

### Sign In

POST http://localhost:5000/api/v1/auth/sign-in

### Sign Out

POST http://localhost:5000/api/v1/auth/sign-out

### Users

### Get Current User

GET http://localhost:5000/api/v1/users/@me

### Update User

PATCH http://localhost:5000/api/v1/users/:user_id

### Delete User

DELETE http://localhost:5000/api/v1/users/:user_id
