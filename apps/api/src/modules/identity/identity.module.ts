import { Module } from '@nestjs/common';
import { ENVIRONMENT_CONFIGURATION } from '../../platform/config/environment';
import { AUTHORIZATION_AUDIT_PORT } from '../../platform/security/authorization-audit.port';
import { SESSION_AUTHENTICATOR } from '../../platform/security/principal';
import { AccountsController } from './api/accounts.controller';
import { MfaController } from './api/mfa.controller';
import { PasswordController } from './api/password.controller';
import { RegistrationController } from './api/registration.controller';
import { SessionController } from './api/session.controller';
import { AdministratorProvisioningService } from './application/administrator-provisioning.service';
import { IdentityAuthorizationAudit } from './application/authorization-audit.service';
import { IdentityAuditService } from './application/identity-audit.service';
import { IdentityService } from './application/identity.service';
import { MfaService } from './application/mfa.service';
import { createNotificationTransport } from './application/notification/create-notification-transport';
import { NOTIFICATION_PORT } from './application/notification/notification.port';
import { PasswordResetService } from './application/password-reset.service';
import { SecurityEventService } from './application/security-event.service';
import { SessionService } from './application/session.service';
import { IDENTITY_AUDIT } from './contracts';
import { IdentityTokenRepository } from './persistence/identity-token.repository';
import { MfaRepository } from './persistence/mfa.repository';
import { SecurityEventRepository } from './persistence/security-event.repository';
import { SessionRepository } from './persistence/session.repository';
import { UserRepository } from './persistence/user.repository';

/**
 * Identity and access module.
 *
 * Everything that authenticates a caller, authorizes it, or records an access decision lives here.
 * The platform layer owns the guard order and the shared vocabulary; this module owns the data and
 * the decisions.
 */
@Module({
  controllers: [
    RegistrationController,
    SessionController,
    MfaController,
    PasswordController,
    AccountsController,
  ],
  providers: [
    UserRepository,
    SessionRepository,
    IdentityTokenRepository,
    MfaRepository,
    SecurityEventRepository,
    SecurityEventService,
    SessionService,
    MfaService,
    IdentityService,
    PasswordResetService,
    AdministratorProvisioningService,
    IdentityAuthorizationAudit,
    IdentityAuditService,
    { provide: IDENTITY_AUDIT, useExisting: IdentityAuditService },
    { provide: SESSION_AUTHENTICATOR, useExisting: SessionService },
    { provide: AUTHORIZATION_AUDIT_PORT, useExisting: IdentityAuthorizationAudit },
    {
      provide: NOTIFICATION_PORT,
      inject: [ENVIRONMENT_CONFIGURATION],
      useFactory: createNotificationTransport,
    },
  ],
  exports: [
    SESSION_AUTHENTICATOR,
    AUTHORIZATION_AUDIT_PORT,
    AdministratorProvisioningService,
    IDENTITY_AUDIT,
  ],
})
export class IdentityModule {}
