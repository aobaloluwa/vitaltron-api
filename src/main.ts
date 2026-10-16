
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Add security-related HTTP headers.
  app.use(helmet());

  // Give all API endpoints a consistent prefix.
  app.setGlobalPrefix('api/v1');

  // Allow only explicitly configured browser origins.
  const corsOrigins = configService
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Validate incoming request data.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Describe Vitaltron's API for Swagger.
  
const swaggerConfig = new DocumentBuilder()
  .setTitle('Vitaltron API')
  .setDescription(
    'API documentation for Vitaltron, the Portable Intelligent Health Identity platform.',
  )
  .setVersion('1.0')
  .addBearerAuth(
    {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Enter your Vitaltron access token',
    },
    'bearer',
  )
  .build();


  const swaggerDocument = SwaggerModule.createDocument(
    app,
    swaggerConfig,
  );

  // Keep interactive API documentation out of production.
  if (configService.get<string>('NODE_ENV') !== 'production') {
    SwaggerModule.setup('api/docs', app, swaggerDocument);
  }

  const port = configService.get<number>('PORT', 3000);

  await app.listen(port);

  console.log(`Vitaltron API is running on port ${port}`);
}

bootstrap();
