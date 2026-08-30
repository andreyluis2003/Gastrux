# Restaurantes Platform - Complete Implementation Guide

## Overview
This is a comprehensive guide for the Restaurantes platform - a lightweight, efficient restaurant management system built with Next.js, TypeScript, and Prisma.

## Architecture Overview

### Tech Stack
- **Frontend**: Next.js 14, React 18, TypeScript, TailwindCSS, Shadcn/ui
- **Backend**: Next.js API Routes, Node.js
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js
- **Notifications**: Server-Sent Events (SSE)
- **Analytics**: Google Analytics 4 (GA4)
- **Styling**: TailwindCSS with custom themes

### Project Structure
```
/nextjs_space
├── app/
│   ├── api/              # API routes (authentication, CRUD operations)
│   ├── admin/            # Admin dashboard pages
│   ├── auth/             # Authentication pages
│   ├── dashboard/        # Main dashboard
│   └── page.tsx          # Landing page
├── components/
│   ├── ui/              # Reusable UI components
│   ├── admin/           # Admin-specific components
│   ├── analytics/       # Analytics components
│   └── theme-customizer # Theme customization
├── hooks/               # Custom React hooks
├── lib/                 # Utilities and helpers
├── prisma/
│   └── schema.prisma    # Database schema
└── public/              # Static assets
```

## Core Features

### 1. Authentication & Authorization
- Email/password authentication with NextAuth.js
- Google OAuth integration
- Role-based access control (OWNER, MANAGER, COOK, CASHIER, ADMIN)
- Secure password hashing with bcryptjs

### 2. Real-time Notifications
- Server-Sent Events (SSE) for live updates
- 25+ notification types (stock alerts, orders, payments, staff, admin ops)
- Severity levels (LOW, MEDIUM, HIGH, CRITICAL)
- Persistent storage in database
- Read/Unread status and archive functionality

### 3. Analytics & Monitoring
- Google Analytics 4 integration for conversion tracking
- Scroll depth monitoring
- Time on page tracking
- CTA click tracking
- Event-based analytics

### 4. A/B Testing
- Built-in A/B testing framework
- Multiple test variants per page element
- Persistent variant selection per user
- Automatic conversion tracking

### 5. Theme System
- 5 predefined color themes
- Custom color customization
- Light/dark mode support
- CSS variables for dynamic theming

### 6. Restaurant Management Modules
- **Inventory**: Ingredient tracking, stock management
- **Recipes**: Recipe management, cost calculation
- **Production Planning**: Daily plan scheduling
- **Orders**: Order management, KDS integration
- **Financial**: Cash flow tracking, analytics
- **Staff**: User management, roles, shifts
- **Audit Logs**: Comprehensive action logging

## Database Schema

### Key Models
- **User**: User accounts with roles
- **Ingredient**: Stock/inventory items
- **Recipe**: Recipe definitions with costs
- **Order**: Sales orders with items
- **Stock**: Current inventory levels
- **Notification**: Real-time notifications
- **AuditLog**: All system actions
- **StaffShift**: Staff scheduling

## API Routes

### Authentication
- POST `/api/auth/[...nextauth]` - NextAuth handler
- POST `/api/signup` - User registration

### Ingredients
- GET `/api/ingredients` - List all ingredients
- POST `/api/ingredients` - Create ingredient
- GET/PUT/DELETE `/api/ingredients/[id]` - Ingredient CRUD

### Orders
- GET/POST `/api/orders` - Order management
- GET/POST `/api/kds/orders` - KDS integration

### Notifications
- GET `/api/notifications/subscribe` - SSE endpoint
- GET `/api/notifications/list` - List notifications
- POST `/api/notifications/read` - Mark as read
- POST `/api/notifications/archive` - Archive notifications

### Analytics
- GET `/api/analytics/stats` - Analytics statistics
- GET `/api/analytics/trends` - Trend analysis

## Configuration

### Environment Variables
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/restaurantes

# Authentication
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-key

# Google Analytics
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX

# Optional: Email notifications
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-password
```

### Database Setup
1. Create PostgreSQL database
2. Run Prisma migrations: `yarn prisma migrate dev`
3. Seed data: `yarn prisma db seed`

## Deployment

### Production Build
```bash
yarn build
```

### Environment for Production
Set all required environment variables in production deployment:
- DATABASE_URL (production database)
- NEXTAUTH_SECRET (strong random secret)
- NEXTAUTH_URL (production domain)
- NEXT_PUBLIC_GA_MEASUREMENT_ID (GA4 ID)

### Performance Optimization
- Static page generation for landing page
- Image optimization with Next.js Image
- Code splitting for faster loads
- Database query optimization with indexes
- Caching headers for static assets

## Development Workflow

### Local Development
```bash
# Install dependencies
yarn install

# Run database migrations
yarn prisma migrate dev

# Seed development data
yarn prisma db seed

# Start development server
yarn dev
```

### Testing
```bash
# TypeScript compilation check
yarn tsc --noEmit

# Build check
yarn build
```

## Best Practices

### Frontend
- Use shadcn/ui components for consistency
- Follow TailwindCSS utilities
- Implement proper error handling
- Use React hooks for state management
- Add accessibility attributes (aria-labels)

### Backend
- Validate all inputs on API routes
- Use role-based access control
- Log all significant actions
- Handle errors gracefully
- Implement rate limiting for sensitive endpoints

### Database
- Use Prisma for all database operations
- Create indexes for frequently queried fields
- Regular backup of production data
- Monitor database performance

### Analytics
- Track all user conversions
- Monitor page performance metrics
- Set up GA4 alerts for anomalies
- Regular review of user behavior data

## Troubleshooting

### Common Issues

**Database Connection Error**
- Check DATABASE_URL format
- Verify PostgreSQL is running
- Check network connectivity

**Authentication Not Working**
- Verify NEXTAUTH_SECRET is set
- Check NEXTAUTH_URL matches domain
- Clear browser cookies

**Analytics Not Tracking**
- Set NEXT_PUBLIC_GA_MEASUREMENT_ID
- Check GA4 Tag Assistant extension
- Verify no ad blockers are active

**Build Errors**
- Run `yarn clean` to clear cache
- Run `yarn install` to reinstall dependencies
- Check for TypeScript errors: `yarn tsc --noEmit`

## Support & Documentation

### Official Documentation
- [Next.js](https://nextjs.org/docs)
- [Prisma](https://www.prisma.io/docs/)
- [NextAuth.js](https://next-auth.js.org/)
- [TailwindCSS](https://tailwindcss.com/docs)
- [Google Analytics 4](https://support.google.com/analytics)

### Project Documentation
- `STYLE_GUIDE.md` - Design system and component usage
- `ANALYTICS_SETUP.md` - GA4 integration guide
- `.project_instructions.md` - Project history and decisions

## Future Enhancements

1. **Payment Integration**: Stripe for subscription billing
2. **Email Notifications**: SendGrid for email alerts
3. **File Storage**: Cloud storage for documents
4. **Mobile App**: React Native mobile application
5. **Advanced Analytics**: Custom dashboards and reports
6. **Integrations**: iFood, Uber Eats, delivery platforms

---

**Version**: 1.0
**Last Updated**: April 2026
**License**: Proprietary
