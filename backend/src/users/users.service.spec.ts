import type { Repository } from 'typeorm';
import type { User } from './user.entity';
import { UserRole } from './user-role.enum';
import { UsersService } from './users.service';

function setup() {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['addSelect', 'where']) qb[m] = jest.fn(() => qb);
  qb.getOne = jest.fn().mockResolvedValue({ id: 'u-1' });
  const repo = {
    findOneBy: jest.fn().mockResolvedValue({ id: 'u-1' }),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn(() => qb),
  };
  return { service: new UsersService(repo as unknown as Repository<User>), repo, qb };
}

describe('UsersService', () => {
  it('finds a user by id', async () => {
    const { service, repo } = setup();
    await expect(service.findById('u-1')).resolves.toEqual({ id: 'u-1' });
    expect(repo.findOneBy).toHaveBeenCalledWith({ id: 'u-1' });
  });

  it('selects the password hash and matches the email case-insensitively', async () => {
    const { service, qb } = setup();
    await service.findByEmailWithPassword('Alice@Example.com');
    expect(qb.addSelect).toHaveBeenCalledWith('user.password');
    expect(qb.where).toHaveBeenCalledWith('lower(user.email) = lower(:email)', {
      email: 'Alice@Example.com',
    });
  });

  it('lists all users ordered by name', async () => {
    const { service, repo } = setup();
    await service.list();
    expect(repo.find).toHaveBeenCalledWith({ where: {}, order: { name: 'ASC' } });
  });

  it('filters the list by role', async () => {
    const { service, repo } = setup();
    await service.list(UserRole.Validator);
    expect(repo.find).toHaveBeenCalledWith({
      where: { role: UserRole.Validator },
      order: { name: 'ASC' },
    });
  });
});
