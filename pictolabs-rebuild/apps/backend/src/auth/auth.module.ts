import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { BoothSecretGuard } from './guards/booth-secret.guard';
import { BoothConfigAuthGuard } from './guards/booth-config-auth.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'pictolabs-dev-secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, BoothSecretGuard, BoothConfigAuthGuard],
  exports: [AuthService, JwtModule, JwtAuthGuard, BoothSecretGuard, BoothConfigAuthGuard],
})
export class AuthModule {}
